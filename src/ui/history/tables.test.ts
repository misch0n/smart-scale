import { describe, expect, it } from 'vitest';
import type { HistoryEntry } from '../../app/history';
import { compareTable, metricTiles, phaseRows, signedFixed } from './tables';
import { simulatedEntry } from './test-entries';

const a = simulatedEntry({ seed: 1, shot: { preInfusionMs: 7400, extractionMs: 24_600 } }).entry;
const b = simulatedEntry({ seed: 2, shot: { preInfusionMs: 5200, extractionMs: 21_800 } }).entry;

function withShot(entry: HistoryEntry, shot: Partial<HistoryEntry['shot']>): HistoryEntry {
  return { ...entry, shot: { ...entry.shot, ...shot } };
}

const tile = (entry: HistoryEntry, id: string) => metricTiles(entry).find((t) => t.id === id)!;

describe('metricTiles', () => {
  it('shows every metric in the board’s order, with its note', () => {
    const tiles = metricTiles(a);
    const metrics = a.segment!.metrics;
    expect(tiles.map((t) => t.label)).toEqual([
      'First drip',
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
    expect(tile(a, 'first-drip').note?.text).toBe('after pump on');
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

  it('shows the beans, the grind with the grinder, and the milk, or that they were skipped', () => {
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
      ['Grind', 'ORO Mignon · 6.2', '16.9', '· retention 0.3 g'],
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
      ['Grind', '22 clicks', null, 'skipped'],
      ['Extraction', 'target: 18.0 g × 2', a.segment!.metrics.yieldG!.toFixed(1), 'of 36.0'],
    ]);
  });
});

describe('compareTable', () => {
  it('lists the doses and every metric as A, A − B and B, without rows neither has', () => {
    const table = compareTable(withShot(a, { doseG: 18.2 }), b);
    const ma = a.segment!.metrics;
    const mb = b.segment!.metrics;
    expect(table.rows.map((row) => row.id)).toEqual([
      'dose',
      'first-drip',
      'extraction',
      'total',
      'yield',
      'ratio',
      'flow',
      'pump-off-weight',
      'tail',
    ]);
    const row = (id: string) => table.rows.find((r) => r.id === id)!;
    expect(row('dose')).toEqual({
      id: 'dose',
      name: 'Dose',
      unit: 'g',
      a: '18.2',
      delta: '+0.2',
      b: '18.0',
    });
    expect(row('first-drip').delta).toBe(signedFixed(ma.firstDripS! - mb.firstDripS!, 1));
    expect(Number(row('first-drip').delta!.replace('−', '-'))).toBeCloseTo(2.2, 0);
    // The ratio is the match's: the yield over the dose the analysis matched it with.
    expect(row('ratio')).toMatchObject({
      a: `1:${a.match.ratio!.toFixed(2)}`,
      delta: signedFixed(a.match.ratio! - b.match.ratio!, 2),
      b: `1:${(mb.yieldG! / 18).toFixed(2)}`,
    });
    expect(row('flow').delta).toBe(signedFixed(ma.averageFlowGps! - mb.averageFlowGps!, 2));
    expect(table.drink).toEqual({ a: 'Espresso', b: 'Espresso' });
    expect(table.taste).toEqual({ a: null, b: null });
  });

  it('shows a side missing as null, without Δ', () => {
    const table = compareTable({ ...a, segment: null, match: { ...a.match, ratio: null } }, b);
    const yieldRow = table.rows.find((r) => r.id === 'yield')!;
    expect(yieldRow).toMatchObject({
      a: null,
      delta: null,
      b: b.segment!.metrics.yieldG!.toFixed(1),
    });
  });

  it('compares grind settings on the same grinder, and only names it then', () => {
    const oro = { grinderId: null, grinderName: 'ORO' };
    const table = compareTable(
      withShot(a, { ...oro, grindSetting: { kind: 'stepless', value: 6.2 }, groundG: 16.9 }),
      withShot(b, { ...oro, grindSetting: { kind: 'stepless', value: 6.4 }, groundG: 16.7 }),
    );
    expect(table.rows.slice(0, 2)).toEqual([
      { id: 'grind', name: 'Grind', unit: 'ORO', a: '6.2', delta: '−0.2', b: '6.4' },
      { id: 'ground', name: 'Ground', unit: 'g', a: '16.9', delta: '+0.2', b: '16.7' },
    ]);
    const other = compareTable(
      withShot(a, { ...oro, grindSetting: { kind: 'stepless', value: 6.2 } }),
      withShot(b, { grinderName: 'Comandante', grindSetting: { kind: 'clicks', value: 22 } }),
    );
    expect(other.rows[0]).toEqual({
      id: 'grind',
      name: 'Grind',
      unit: '',
      a: '6.2',
      delta: null,
      b: '22 clicks',
    });
  });

  it('carries the drinks and the tastes', () => {
    const table = compareTable(
      withShot(a, { recipeName: 'Cappuccino', direction: 'balanced' }),
      withShot(b, { recipeName: null, direction: 'sour' }),
    );
    expect(table.drink).toEqual({ a: 'Cappuccino', b: 'Espresso' });
    expect(table.taste).toEqual({ a: 'balanced', b: 'sour' });
  });
});

describe('signedFixed', () => {
  it('writes a difference with its sign, in the value’s digits', () => {
    expect(signedFixed(2.2, 1)).toBe('+2.2');
    expect(signedFixed(-0.05, 2)).toBe('−0.05');
    expect(signedFixed(0.04, 1)).toBe('±0.0');
    expect(signedFixed(-2, 0)).toBe('−2');
  });
});
