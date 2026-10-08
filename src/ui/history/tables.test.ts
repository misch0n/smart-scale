import { describe, expect, it } from 'vitest';
import type { HistoryEntry } from '../../app/history';
import { metricTiles, phaseRows } from './tables';
import { simulatedEntry } from './test-entries';

const a = simulatedEntry({ seed: 1, shot: { preInfusionMs: 7400, extractionMs: 24_600 } }).entry;

function withShot(entry: HistoryEntry, shot: Partial<HistoryEntry['shot']>): HistoryEntry {
  return { ...entry, shot: { ...entry.shot, ...shot } };
}

const tile = (entry: HistoryEntry, id: string) => metricTiles(entry).find((t) => t.id === id)!;

describe('metricTiles', () => {
  it('shows every metric in the board’s order, with its note', () => {
    const tiles = metricTiles(a);
    const metrics = a.segment!.metrics;
    expect(tiles.map((t) => t.label)).toEqual([
      'Preinfusion',
      'Extraction',
      'Total',
      'Yield',
      'Ratio',
      'Average flow',
      'Weight at pump off',
      'Tail',
    ]);
    expect(tiles.map((t) => [t.value, t.unit])).toEqual([
      [metrics.firstDripS!.toFixed(1), 's'],
      [metrics.extractionS!.toFixed(1), 's'],
      [metrics.totalS!.toFixed(1), 's'],
      [metrics.yieldG!.toFixed(1), 'g'],
      [`1:${a.match.ratio!.toFixed(2)}`, ''],
      [metrics.averageFlowGps!.toFixed(2), 'g/s'],
      [metrics.pumpOffWeightG!.toFixed(1), 'g'],
      [metrics.tailMassG!.toFixed(1), 'g'],
    ]);
    expect(tile(a, 'first-drip').note?.text).toBe('pump on → first drip');
    expect(tile(a, 'ratio').note?.text).toBe('target 1:2');
    expect(tile(a, 'pump-off-weight').note?.text).toBe(`at ${metrics.totalS!.toFixed(1)} s`);
  });

  it('says how far the yield is from the target, a warning past 1 g over', () => {
    const yieldG = a.segment!.metrics.yieldG!;
    const near = tile(withShot(a, { doseG: yieldG / 2 + 0.25, targetRatio: 2 }), 'yield').note;
    expect(near).toEqual({
      text: `target ${(yieldG + 0.5).toFixed(1)}`,
      delta: { text: '−0.5', warn: false },
    });
    const over = tile(withShot(a, { doseG: (yieldG - 1.6) / 2, targetRatio: 2 }), 'yield').note;
    expect(over?.delta).toEqual({ text: '+1.6', warn: true });
    expect(tile(withShot(a, { doseG: null }), 'yield').note).toBeNull();
  });

  it('shows no numbers for a shot without a segment', () => {
    const tiles = metricTiles({ ...a, segment: null, match: { ...a.match, ratio: null } });
    expect(tiles.every((t) => t.value === null)).toBe(true);
    expect(tile({ ...a, segment: null }, 'pump-off-weight').note).toBeNull();
  });
});

describe('phaseRows', () => {
  it('shows the extraction against its target, until the other phases exist', () => {
    const yieldG = a.segment!.metrics.yieldG!;
    expect(phaseRows(a)).toEqual([
      {
        id: 'extraction',
        name: 'Extraction',
        sub: 'target: 18.0 g × 2',
        value: yieldG.toFixed(1),
        after: 'of 36.0',
      },
    ]);
  });

  it('shows the beans and the milk, or that they were skipped, and no grind (T3.8)', () => {
    const full = withShot(a, {
      beansPhase: 'done',
      beansWeighedG: 17.2,
      basketSizeG: 17,
      grindPhase: 'done',
      groundG: 16.9,
      grinderName: 'ORO Mignon',
      grindSetting: { kind: 'stepless', value: 6.2 },
      milkPhase: 'done',
      milkRatio: 3,
      milkG: 104.4,
    });
    const yieldG = a.segment!.metrics.yieldG!;
    expect(phaseRows(full).map((row) => [row.name, row.sub, row.value, row.after])).toEqual([
      ['Beans', 'target: basket 17.0 g', '17.2', 'of 17.0'],
      ['Extraction', 'target: 18.0 g × 2', yieldG.toFixed(1), 'of 36.0'],
      ['Milk', `target: ${yieldG.toFixed(1)} g × 3`, '104', `of ${Math.round(yieldG * 3)}`],
    ]);
    const skipped = withShot(a, {
      beansPhase: 'skipped',
      grindPhase: 'skipped',
      grinderName: null,
      grindSetting: { kind: 'clicks', value: 22 },
    });
    expect(phaseRows(skipped).map((row) => [row.name, row.sub, row.value, row.after])).toEqual([
      ['Beans', null, null, 'skipped'],
      ['Extraction', 'target: 18.0 g × 2', a.segment!.metrics.yieldG!.toFixed(1), 'of 36.0'],
    ]);
  });
});
