import { describe, expect, it } from 'vitest';
import { isId } from './ids';
import { SchemaError } from './schema';
import {
  createShot,
  normaliseShot,
  sameShotIdentity,
  updateShot,
  type NewShot,
  type ShotMetadata,
} from './shot';

const REC = '01923456-789a-7000-8000-000000000001';
const BAG = '01923456-789a-7000-8000-000000000002';
const NOW = Date.UTC(2026, 9, 3, 8, 0);

const NEW: NewShot = { recordingId: REC, anchorTMs: 41_250.5, source: 'live' };

describe('createShot', () => {
  it('starts with every piece of metadata null', () => {
    const shot = createShot(NEW, NOW);
    expect(isId(shot.id)).toBe(true);
    expect(shot).toEqual({
      id: shot.id,
      recordingId: REC,
      anchorTMs: 41_250.5,
      source: 'live',
      createdAtEpochMs: NOW,
      updatedAtEpochMs: NOW,
      discardedAtEpochMs: null,
      direction: null,
      channelled: null,
      tags: null,
      doseG: null,
      targetRatio: null,
      recipeId: null,
      recipeName: null,
      milkRatio: null,
      beansPhase: null,
      beansWeighedG: null,
      grindPhase: null,
      groundG: null,
      milkPhase: null,
      milkG: null,
      machineId: null,
      machineName: null,
      pressureBar: null,
      basketId: null,
      basketSizeG: null,
      grinderId: null,
      grinderName: null,
      grindSetting: null,
      burrEpochId: null,
      packId: null,
      packName: null,
      packRoastDate: null,
      packOpenDate: null,
      containerId: null,
      lastDescaleDate: null,
      lastBackflushDate: null,
      lastGrinderCareDate: null,
    });
  });

  it('keeps the metadata it is given', () => {
    const shot = createShot(
      { ...NEW, direction: 'sour', doseG: 18, targetRatio: 2, tags: [] },
      NOW,
    );
    expect(shot).toMatchObject({ direction: 'sour', doseG: 18, targetRatio: 2, tags: [] });
  });
});

describe('updateShot', () => {
  const shot = createShot(NEW, NOW);

  it('applies changes and moves updatedAtEpochMs only', () => {
    const graded = updateShot(shot, { direction: 'balanced', channelled: false }, NOW + 5000);
    expect(graded).toEqual({
      ...shot,
      direction: 'balanced',
      channelled: false,
      updatedAtEpochMs: NOW + 5000,
    });
    expect(shot.direction).toBeNull();
  });

  it('skips undefined changes and clears fields set to null', () => {
    const graded = updateShot(shot, { direction: 'bitter', doseG: 18 }, NOW + 1);
    const next = updateShot(graded, { direction: undefined, doseG: null }, NOW + 2);
    expect(next.direction).toBe('bitter');
    expect(next.doseG).toBeNull();
  });

  it('discards a shot with a tombstone, keeping it', () => {
    const discarded = updateShot(shot, { discardedAtEpochMs: NOW + 60_000 }, NOW + 60_000);
    expect(discarded.discardedAtEpochMs).toBe(NOW + 60_000);
    expect(discarded.anchorTMs).toBe(shot.anchorTMs);
  });

  it.each(['id', 'recordingId', 'anchorTMs', 'source', 'createdAtEpochMs', 'updatedAtEpochMs'])(
    'refuses to change %s (D-007)',
    (key) => {
      const changes = { [key]: 1 } as unknown as Partial<ShotMetadata>;
      expect(() => updateShot(shot, changes, NOW + 1)).toThrow(TypeError);
    },
  );

  it('refuses a malformed value', () => {
    const changes = { direction: 'salty' } as unknown as Partial<ShotMetadata>;
    expect(() => updateShot(shot, changes, NOW + 1)).toThrow(SchemaError);
  });
});

describe('shot fields', () => {
  const shot = createShot(NEW, NOW);

  it('tell no tags ([]) apart from tags not captured (null)', () => {
    expect(normaliseShot({ ...shot, tags: [] }).tags).toEqual([]);
    expect(normaliseShot({ ...shot, tags: undefined }).tags).toBeNull();
  });

  it('name the bad tag', () => {
    expect(() => normaliseShot({ ...shot, tags: ['warm-up', 3] })).toThrow('shot.tags[1]:');
  });

  it('take a decimal stepless setting and whole clicks', () => {
    const stepless = { kind: 'stepless', value: 4.25 } as const;
    const clicks = { kind: 'clicks', value: 18 } as const;
    expect(normaliseShot({ ...shot, grindSetting: stepless }).grindSetting).toEqual(stepless);
    expect(normaliseShot({ ...shot, grindSetting: clicks }).grindSetting).toEqual(clicks);
  });

  it.each([
    ['fractional clicks', { kind: 'clicks', value: 18.5 }, 'shot.grindSetting.value:'],
    ['an unknown kind', { kind: 'turns', value: 1 }, 'shot.grindSetting.kind:'],
    ['a bare number', 18, 'shot.grindSetting:'],
  ])('refuse %s', (_, grindSetting, message) => {
    expect(() => normaliseShot({ ...shot, grindSetting })).toThrow(message);
  });

  it('take entity references as ids', () => {
    expect(normaliseShot({ ...shot, packId: BAG }).packId).toBe(BAG);
    expect(() => normaliseShot({ ...shot, packId: 'Ethiopia' })).toThrow('shot.packId:');
  });

  it('read a pack stored as beanBagId, its name before format version 3', () => {
    const stored = { ...shot } as Record<string, unknown>;
    delete stored.packId;
    const read = normaliseShot({ ...stored, beanBagId: BAG });
    expect(read.packId).toBe(BAG);
    expect(read).not.toHaveProperty('beanBagId');
    expect(normaliseShot({ ...stored, beanBagId: null }).packId).toBeNull();
    // A shot that has both keeps its packId.
    expect(normaliseShot({ ...shot, packId: null, beanBagId: BAG }).packId).toBeNull();
  });

  it('take dates as YYYY-MM-DD, and phases as done or skipped', () => {
    const dated = normaliseShot({ ...shot, packRoastDate: '2026-09-22', beansPhase: 'skipped' });
    expect(dated).toMatchObject({ packRoastDate: '2026-09-22', beansPhase: 'skipped' });
    expect(() => normaliseShot({ ...shot, packRoastDate: '22 Sep 2026' })).toThrow(
      'shot.packRoastDate: expected a date as YYYY-MM-DD',
    );
    expect(() => normaliseShot({ ...shot, milkPhase: 'pending' })).toThrow('shot.milkPhase:');
  });
});

describe('sameShotIdentity', () => {
  it('ignores metadata and the update time, and nothing else', () => {
    const shot = createShot(NEW, NOW);
    const graded = updateShot(shot, { direction: 'sour', tags: ['wdt'] }, NOW + 1000);
    expect(sameShotIdentity(shot, graded)).toBe(true);
    const others = [
      { id: '01923456-789a-7000-8000-0000000000ff' },
      { recordingId: BAG },
      { anchorTMs: 41_250.25 },
      { source: 'manual' as const },
      { createdAtEpochMs: NOW + 1 },
    ];
    for (const change of others) {
      expect(sameShotIdentity(shot, { ...shot, ...change }), JSON.stringify(change)).toBe(false);
    }
  });
});
