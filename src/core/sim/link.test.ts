import { describe, expect, it } from 'vitest';
import { decodeFrame, encodeWeightFrame } from '../protocol';
import { Link } from './link';
import { resolveLinkParams, type LinkParams } from './params';
import { Rng } from './random';

const QUIET: Partial<LinkParams> = {
  minLatencyMs: 15,
  connectionIntervalMs: 0,
  retransmitProbability: 0,
  jitterMeanMs: 0,
  stallProbability: 0,
};

/** Sends `n` frames 100 ms apart (tag = index) and receives everything. */
function run(overrides: Partial<LinkParams>, n = 200, seed = 1) {
  const link = new Link<number>(resolveLinkParams(overrides), new Rng(seed));
  for (let i = 0; i < n; i++) {
    const bytes = encodeWeightFrame({ timerMs: i, weightG: i / 100 });
    link.send({ source: 'ff11', bytes, sentMs: i * 100, tag: i });
  }
  return { link, arrived: link.receive(Infinity) };
}

describe('Link', () => {
  it('delivers after exactly the minimum latency when nothing else applies', () => {
    const { arrived } = run(QUIET, 20);
    expect(arrived.map((f) => f.tArrival - f.sentMs)).toEqual(new Array<number>(20).fill(15));
  });

  it('delivers on the connection-event grid', () => {
    const { arrived } = run({ ...QUIET, connectionIntervalMs: 30 });
    const phase = arrived[0].tArrival % 30;
    for (const frame of arrived) {
      const offGrid = (((frame.tArrival - phase) % 30) + 30) % 30;
      expect(Math.min(offGrid, 30 - offGrid)).toBeLessThan(1e-6);
      expect(frame.tArrival - frame.sentMs).toBeGreaterThanOrEqual(15);
      expect(frame.tArrival - frame.sentMs).toBeLessThan(15 + 30);
    }
  });

  it('retransmits: a frame misses connection events with the given chance, each in turn', () => {
    const p = 0.2;
    const { arrived } = run({ ...QUIET, connectionIntervalMs: 30, retransmitProbability: p }, 5000);
    // Without a retransmission a frame arrives within one interval of being ready.
    const missed = arrived.map((f) => Math.floor((f.tArrival - f.sentMs - 15) / 30));
    const share = (k: number) => missed.filter((m) => m >= k).length / missed.length;
    expect(share(1)).toBeGreaterThan(p - 0.03);
    expect(share(1)).toBeLessThan(p + 0.03);
    expect(share(2)).toBeGreaterThan(p * p - 0.015);
    expect(share(2)).toBeLessThan(p * p + 0.015);
    // Still on the grid, and in order.
    const phase = arrived[0].tArrival % 30;
    for (const frame of arrived) {
      const offGrid = (((frame.tArrival - phase) % 30) + 30) % 30;
      expect(Math.min(offGrid, 30 - offGrid)).toBeLessThan(1e-6);
    }
    expect(arrived.map((f) => f.tag)).toEqual([...Array(5000).keys()]);
  });

  it('retransmits nothing without a connection-event grid', () => {
    const { arrived } = run({ ...QUIET, retransmitProbability: 0.5 }, 50);
    expect(arrived.map((f) => f.tArrival - f.sentMs)).toEqual(new Array<number>(50).fill(15));
  });

  it('keeps frames in order, with non-decreasing arrival times', () => {
    const { arrived } = run({ jitterMeanMs: 40, stallProbability: 0.05 }, 1000);
    expect(arrived.map((f) => f.tag)).toEqual([...Array(1000).keys()]);
    for (let i = 1; i < arrived.length; i++) {
      expect(arrived[i].tArrival).toBeGreaterThanOrEqual(arrived[i - 1].tArrival);
    }
  });

  it('turns stalls into bursts of frames arriving together', () => {
    const { arrived } = run(
      { ...QUIET, stallProbability: 0.05, stallMinMs: 300, stallMaxMs: 300 },
      1000,
    );
    let together = 0;
    for (let i = 1; i < arrived.length; i++) {
      if (arrived[i].tArrival === arrived[i - 1].tArrival) together++;
    }
    expect(together).toBeGreaterThan(50);
    const delays = arrived.map((f) => f.tArrival - f.sentMs);
    expect(Math.max(...delays)).toBeGreaterThan(250);
  });

  it('drops frames and says so', () => {
    const { link, arrived } = run({ dropProbability: 0.1 }, 2000);
    expect(link.lost.length).toBeGreaterThan(140);
    expect(link.lost.length).toBeLessThan(260);
    expect(link.lost.every((f) => f.reason === 'dropped')).toBe(true);
    expect(arrived.length + link.lost.length).toBe(2000);
    const tags = [...arrived.map((f) => f.tag), ...link.lost.map((f) => f.tag)].sort(
      (a, b) => a - b,
    );
    expect(tags).toEqual([...Array(2000).keys()]);
  });

  it('flips one bit, which the checksum catches', () => {
    const { arrived } = run({ corruptProbability: 1 }, 100);
    for (const frame of arrived) {
      expect(frame.corruption).toBe('bit-flip');
      expect(frame.bytes).toHaveLength(20);
      expect(decodeFrame(frame.bytes)).toMatchObject({ kind: 'invalid', reason: 'checksum' });
    }
  });

  it('truncates frames, which decode as the wrong length', () => {
    const { arrived } = run({ truncateProbability: 1 }, 100);
    for (const frame of arrived) {
      expect(frame.corruption).toBe('truncated');
      expect(frame.bytes.length).toBeLessThan(20);
      expect(decodeFrame(frame.bytes)).toMatchObject({ kind: 'invalid' });
    }
  });

  it('copies the bytes, so damage never reaches the sender', () => {
    const link = new Link<null>(resolveLinkParams({ corruptProbability: 1 }), new Rng(1));
    const bytes = encodeWeightFrame({ timerMs: 0, weightG: 1 });
    const before = [...bytes];
    link.send({ source: 'ff11', bytes, sentMs: 0, tag: null });
    expect([...bytes]).toEqual(before);
  });

  it('returns each frame once, as it arrives', () => {
    const link = new Link<number>(resolveLinkParams(QUIET), new Rng(1));
    for (let i = 0; i < 3; i++) {
      link.send({ source: 'ff11', bytes: new Uint8Array(1), sentMs: i * 100, tag: i });
    }
    expect(link.nextArrivalMs()).toBe(15);
    expect(link.receive(14)).toEqual([]);
    expect(link.receive(115).map((f) => f.tag)).toEqual([0, 1]);
    expect(link.nextArrivalMs()).toBe(215);
    expect(link.receive(1000).map((f) => f.tag)).toEqual([2]);
    expect(link.nextArrivalMs()).toBeNull();
  });

  it('loses what would arrive after the link is cut, and everything sent later', () => {
    const link = new Link<number>(resolveLinkParams(QUIET), new Rng(1));
    link.send({ source: 'ff11', bytes: new Uint8Array(1), sentMs: 0, tag: 0 });
    link.send({ source: 'ff11', bytes: new Uint8Array(1), sentMs: 100, tag: 1 });
    link.cut(50);
    link.send({ source: 'ff12', bytes: new Uint8Array(1), sentMs: 200, tag: 2 });
    expect(link.receive(Infinity).map((f) => f.tag)).toEqual([0]);
    expect(link.lost.map((f) => [f.tag, f.reason])).toEqual([
      [1, 'link-lost'],
      [2, 'link-lost'],
    ]);
  });

  it('is deterministic per seed', () => {
    const a = run({ jitterMeanMs: 20, stallProbability: 0.02, dropProbability: 0.05 }, 500, 9);
    const b = run({ jitterMeanMs: 20, stallProbability: 0.02, dropProbability: 0.05 }, 500, 9);
    expect(a.arrived.map((f) => f.tArrival)).toEqual(b.arrived.map((f) => f.tArrival));
    const c = run({ jitterMeanMs: 20, stallProbability: 0.02, dropProbability: 0.05 }, 500, 10);
    expect(c.arrived.map((f) => f.tArrival)).not.toEqual(a.arrived.map((f) => f.tArrival));
  });
});
