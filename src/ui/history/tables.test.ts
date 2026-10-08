import { describe, expect, it } from 'vitest';
import type { HistoryEntry } from '../../app/history';
import { phaseRows } from './tables';
import { simulatedEntry } from './test-entries';

const a = simulatedEntry({ seed: 1, shot: { preInfusionMs: 7400, extractionMs: 24_600 } }).entry;

function withShot(entry: HistoryEntry, shot: Partial<HistoryEntry['shot']>): HistoryEntry {
  return { ...entry, shot: { ...entry.shot, ...shot } };
}

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
