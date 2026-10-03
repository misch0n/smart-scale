import { describe, expect, it } from 'vitest';
import {
  setBuzzer,
  stopTimer,
  tare,
  tareAndStartTimer,
  toHex,
  type ScaleCommand,
} from '../core/protocol';
import { CommandQueue } from './command-queue';
import { ManualClock } from './scheduler';
import { TransportError } from './types';

/** A queue whose writes log `hex@time` and finish at once. */
function syncQueue(spacingMs = 100) {
  const clock = new ManualClock();
  const writes: string[] = [];
  const queue = new CommandQueue(
    (bytes) => {
      writes.push(`${toHex(bytes, '')}@${clock.now()}`);
    },
    clock,
    spacingMs,
  );
  return { clock, writes, queue };
}

describe('CommandQueue', () => {
  it('writes at once when idle, then spaces the rest out', async () => {
    const { clock, writes, queue } = syncQueue();
    const sent = [
      queue.enqueue(tare()),
      queue.enqueue(tareAndStartTimer()),
      queue.enqueue(stopTimer()),
    ];
    expect(writes).toEqual(['030A01000008@0']);
    expect(queue.pending).toBe(2);
    clock.advance(1000);
    expect(writes).toEqual(['030A01000008@0', '030A0700000E@100', '030A0500000C@200']);
    await Promise.all(sent);
  });

  it("passes a copy of the bytes, so later changes to the command can't reach the write", async () => {
    const command = tare();
    let written: Uint8Array | null = null;
    const queue = new CommandQueue((bytes) => void (written = bytes), new ManualClock(), 0);
    await queue.enqueue(command);
    expect(written).not.toBe(command.bytes);
    expect([...written!]).toEqual([...command.bytes]);
  });

  // D-015: the check happens right before each write, so a command changed while it waited is
  // refused, and the queue moves on.
  it('refuses a command whose bytes were changed while it waited', async () => {
    const { clock, writes, queue } = syncQueue();
    const first = queue.enqueue(tare());
    const tampered = tare();
    const second = queue.enqueue(tampered);
    const third = queue.enqueue(setBuzzer(0));
    tampered.bytes[2] = 0x09; // tare turned into calibration
    tampered.bytes[5] = 0x00;
    clock.advance(1000);
    await first;
    await expect(second).rejects.toMatchObject({ name: 'TransportError', code: 'refused' });
    await third;
    expect(writes).toEqual(['030A01000008@0', '030A0200000B@100']);
  });

  it('refuses a hand-made object that only looks like a command', async () => {
    const { writes, queue } = syncQueue();
    const fake = {
      name: 'tare',
      param: null,
      bytes: Uint8Array.of(3, 10, 0x15, 0, 0, 0x1c),
      unverified: false,
    };
    await expect(queue.enqueue(fake as unknown as ScaleCommand)).rejects.toBeInstanceOf(
      TransportError,
    );
    expect(writes).toEqual([]);
  });

  it('waits for an asynchronous write before the next one', async () => {
    const clock = new ManualClock();
    const log: string[] = [];
    let finish: (() => void) | null = null;
    const queue = new CommandQueue(
      (bytes) => {
        log.push(`start ${bytes[2]}`);
        return new Promise<void>((resolve) => (finish = resolve));
      },
      clock,
      50,
    );
    const a = queue.enqueue(tare());
    const b = queue.enqueue(stopTimer());
    clock.advance(500);
    expect(log).toEqual(['start 1']);
    finish!();
    await a;
    clock.advance(49);
    expect(log).toEqual(['start 1']);
    clock.advance(1);
    expect(log).toEqual(['start 1', 'start 5']);
    finish!();
    await b;
  });

  it('turns a failed write into a write-failed error and carries on', async () => {
    const clock = new ManualClock();
    let calls = 0;
    const queue = new CommandQueue(
      () => {
        calls++;
        if (calls === 1) throw new Error('GATT busy');
        if (calls === 2) return Promise.reject(new Error('link lost'));
      },
      clock,
      10,
    );
    const a = queue.enqueue(tare());
    const b = queue.enqueue(tare());
    const c = queue.enqueue(tare());
    clock.advance(10);
    await expect(a).rejects.toMatchObject({ code: 'write-failed', message: /GATT busy/ });
    clock.advance(10);
    await expect(b).rejects.toMatchObject({ code: 'write-failed', message: /link lost/ });
    clock.advance(10);
    await c;
    expect(calls).toBe(3);
  });

  it('passes a TransportError from the writer through unchanged', async () => {
    const error = new TransportError('disconnected', 'gone');
    const queue = new CommandQueue(() => Promise.reject(error), new ManualClock(), 0);
    await expect(queue.enqueue(tare())).rejects.toBe(error);
  });

  it('clear() rejects what waits and leaves the write in flight alone', async () => {
    const { clock, writes, queue } = syncQueue();
    const first = queue.enqueue(tare());
    const second = queue.enqueue(tare());
    queue.clear(new TransportError('disconnected', 'The connection ended'));
    await first;
    await expect(second).rejects.toMatchObject({ code: 'disconnected' });
    clock.advance(1000);
    expect(writes).toHaveLength(1);
    expect(queue.pending).toBe(0);
  });
});
