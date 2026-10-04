import { describe, expect, it } from 'vitest';
import type { AutoExportSettingsView, AutoExportStatus } from '../app/auto-export';
import { autoExportReminder, describeAutoExport } from './auto-export-text';

const SETTINGS: AutoExportSettingsView = {
  owner: 'someone',
  repo: 'smart-scale-data',
  branch: null,
  pathPrefix: 'recordings/',
  tokenSet: true,
};

function status(overrides: Partial<AutoExportStatus>): AutoExportStatus {
  return {
    state: 'idle',
    pending: 0,
    held: [],
    lastExportEpochMs: null,
    lastError: null,
    retryAtEpochMs: null,
    ...overrides,
  };
}

const time = (epochMs: number): string => `t${epochMs}`;

describe('describeAutoExport', () => {
  it('says how to turn it on, or what is missing', () => {
    expect(describeAutoExport(status({ state: 'off' }), null, time)).toMatch(
      /^Off\. Set up a private GitHub repo below/,
    );
    expect(
      describeAutoExport(status({ state: 'off' }), { ...SETTINGS, tokenSet: false }, time),
    ).toBe('Off: there is no token for someone/smart-scale-data. Enter one below.');
  });

  it('says when it is up to date, and how much is left', () => {
    expect(describeAutoExport(status({ lastExportEpochMs: 5 }), SETTINGS, time)).toBe(
      'On: someone/smart-scale-data. Up to date. Last export t5.',
    );
    expect(describeAutoExport(status({ state: 'working', pending: 2 }), SETTINGS, time)).toBe(
      'Exporting to someone/smart-scale-data… 2 recordings to go. Nothing exported yet.',
    );
  });

  it('says why it waits or stopped', () => {
    expect(
      describeAutoExport(
        status({ state: 'waiting', pending: 1, retryAtEpochMs: 9, lastError: 'GitHub failed' }),
        SETTINGS,
        time,
      ),
    ).toBe(
      'Waiting to try again at t9, or once the phone is back online. GitHub failed. 1 recording to go.',
    );
    expect(
      describeAutoExport(
        status({ state: 'stopped', pending: 3, lastError: 'Check the settings.' }),
        SETTINGS,
        time,
      ),
    ).toBe('Stopped. Check the settings. 3 recordings to go.');
  });
});

describe('autoExportReminder', () => {
  it('reminds while it is off or stopped', () => {
    expect(autoExportReminder(status({ state: 'off' }), null)).toEqual({
      text: "Recordings aren't backed up off this phone: set up automatic export, or use Export all.",
      action: 'Set it up',
    });
    expect(
      autoExportReminder(status({ state: 'off' }), { ...SETTINGS, tokenSet: false })?.text,
    ).toBe("Recordings aren't backed up off this phone: automatic export has no token.");
    expect(
      autoExportReminder(status({ state: 'stopped', lastError: 'The token expired' }), SETTINGS),
    ).toEqual({
      text: "Recordings aren't backed up off this phone: automatic export has stopped. The token expired.",
      action: 'Check the settings',
    });
  });

  it('stays out of the way while it runs or retries by itself', () => {
    for (const state of ['idle', 'working', 'waiting'] as const) {
      expect(autoExportReminder(status({ state }), SETTINGS)).toBeNull();
    }
  });
});
