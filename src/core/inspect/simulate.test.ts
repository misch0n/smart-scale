import { describe, expect, it } from 'vitest';
import { parseExport } from '../export';
import { simulatedExport } from './simulate';

describe('simulatedExport', () => {
  it('writes the same export for the same scenario and seed', () => {
    expect(simulatedExport('espresso', 4).text).toBe(simulatedExport('espresso', 4).text);
    expect(simulatedExport('espresso', 4).text).not.toBe(simulatedExport('espresso', 5).text);
  });

  it('is an export like any other, of one recording, with its truth beside it', () => {
    const simulated = simulatedExport('demo', 2);
    const { bundle } = parseExport(simulated.text);
    expect(bundle.recordings).toHaveLength(1);
    expect(bundle.shots).toEqual([]);
    expect(simulated.truth.recordingId).toBe(bundle.recordings[0].recording.id);
    expect(simulated.truth.shots).toHaveLength(2);
    expect(simulated.fileName).toBe('simulated-demo-seed-2.json');
    expect(simulated.source).toBe('simulated demo, seed 2');
  });

  it('puts the truth on the timeline: the link’s least latency after the sample', () => {
    const { offsetS } = simulatedExport('espresso', 1).truth;
    expect(offsetS).toBeGreaterThan(0.005);
    expect(offsetS).toBeLessThan(0.15);
  });
});
