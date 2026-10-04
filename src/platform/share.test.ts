import { describe, expect, it } from 'vitest';
import { canShareFile, shareFile, type ShareTarget } from './share';

const file = new File(['{}'], 'smart-scale_2026-10-04_083005_000000a1.json', {
  type: 'application/json',
});

describe('canShareFile', () => {
  it('asks canShare about the file itself', () => {
    const asked: ShareData[] = [];
    const target: ShareTarget = {
      share: () => Promise.resolve(),
      canShare: (data) => (asked.push(data!), true),
    };
    expect(canShareFile(target, file)).toBe(true);
    expect(asked).toEqual([{ files: [file] }]);
  });

  it('says no when the browser shares links but not this file', () => {
    expect(canShareFile({ share: () => Promise.resolve(), canShare: () => false }, file)).toBe(
      false,
    );
  });

  it('says no without share or canShare, or when canShare throws', () => {
    expect(canShareFile(undefined, file)).toBe(false);
    expect(canShareFile({}, file)).toBe(false);
    expect(canShareFile({ share: () => Promise.resolve() }, file)).toBe(false);
    expect(canShareFile({ canShare: () => true }, file)).toBe(false);
    const throwing: ShareTarget = {
      share: () => Promise.resolve(),
      canShare: () => {
        throw new TypeError('files unsupported');
      },
    };
    expect(canShareFile(throwing, file)).toBe(false);
  });
});

describe('shareFile', () => {
  it('shares the file, calling share before it returns', async () => {
    const shared: ShareData[] = [];
    const target: ShareTarget = { share: (data) => (shared.push(data), Promise.resolve()) };
    const sharing = shareFile(target, file);
    // Called synchronously, while the click's user activation lasts.
    expect(shared).toEqual([{ files: [file] }]);
    expect(await sharing).toBe('shared');
  });

  it('reports a cancelled share sheet as cancelled, and other failures as errors', async () => {
    const cancelled: ShareTarget = {
      share: () => Promise.reject(new DOMException('Share canceled', 'AbortError')),
    };
    expect(await shareFile(cancelled, file)).toBe('cancelled');
    const refused: ShareTarget = {
      share: () => Promise.reject(new DOMException('No user activation', 'NotAllowedError')),
    };
    await expect(shareFile(refused, file)).rejects.toMatchObject({ name: 'NotAllowedError' });
    await expect(shareFile({}, file)).rejects.toThrow(TypeError);
  });
});
