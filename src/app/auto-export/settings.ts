/**
 * The automatic export's settings (T1.20, D-027): which repo, where in it, and the token. The
 * user enters them on the device, and they live in the device-local store (`storage.local`),
 * which no export carries (D-030). Nothing is uploaded until owner, repo and token are all set.
 *
 * The UI never gets the token back: `settingsView` says only whether one is set, and a draft
 * leaves `token` undefined to keep the stored one.
 */

import { field, SchemaError, type JsonValue, type ObjectSchema } from '../../core/model';
import type { LocalRepository } from '../../storage';

/** The settings' key in the device-local store. */
export const SETTINGS_KEY = 'autoExport.settings';

/** Where in the repo the files go, unless the user says otherwise. */
export const DEFAULT_PATH_PREFIX = 'recordings/';

export interface AutoExportSettings {
  /** The GitHub user or organisation that owns the repo. */
  readonly owner: string;
  readonly repo: string;
  /** The branch to write to; null for the repo's default branch. */
  readonly branch: string | null;
  /** Where in the repo the files go: `''` for the top, or folders ending in `/`. */
  readonly pathPrefix: string;
  /** A fine-grained personal access token; null when there is none. */
  readonly token: string | null;
}

/** Settings with everything needed to upload. */
export type ConfiguredSettings = AutoExportSettings & { readonly token: string };

/** The settings as the UI sees them: everything but the token itself. */
export interface AutoExportSettingsView {
  readonly owner: string;
  readonly repo: string;
  readonly branch: string | null;
  readonly pathPrefix: string;
  readonly tokenSet: boolean;
}

/** What the user entered in the settings form. */
export interface SettingsDraft {
  readonly owner: string;
  readonly repo: string;
  /** `''` for the repo's default branch. */
  readonly branch: string;
  /** `''` for the top of the repo. */
  readonly pathPrefix: string;
  /** A new token, null to remove the stored one, or undefined to keep it. */
  readonly token?: string | null;
}

/** A draft the settings can't take, naming the field to fix. */
export class SettingsError extends Error {
  readonly field: keyof SettingsDraft;

  constructor(fieldName: keyof SettingsDraft, message: string) {
    super(message);
    this.name = 'SettingsError';
    this.field = fieldName;
  }
}

const SETTINGS_SCHEMA: ObjectSchema<AutoExportSettings> = {
  owner: field.string,
  repo: field.string,
  branch: field.nullable(field.string),
  pathPrefix: field.string,
  token: field.nullable(field.string),
};

const parseSettings = field.object(SETTINGS_SCHEMA);

/** GitHub user and organisation names: letters, digits and single hyphens inside. */
const OWNER = /^[A-Za-z0-9](?:-?[A-Za-z0-9])*$/;
const REPO = /^[A-Za-z0-9._-]+$/;
/** What git refuses in a branch name, in short (`git check-ref-format`), control characters aside. */
const BAD_BRANCH = /[\s~^:?*[\\]|\.\.|@\{|^[/.-]|[/.]$|\/\/|\.lock$|^@$/;

/**
 * Checks a draft and turns it into settings. `storedToken` is kept when the draft's token is
 * undefined.
 *
 * @throws SettingsError naming the first field to fix.
 */
export function settingsFromDraft(
  draft: SettingsDraft,
  storedToken: string | null,
): AutoExportSettings {
  const owner = draft.owner.trim();
  if (owner === '' || owner.length > 39 || !OWNER.test(owner)) {
    throw new SettingsError(
      'owner',
      'The owner is the GitHub user or organisation name: letters, digits and hyphens.',
    );
  }
  const repo = draft.repo.trim();
  if (repo === '' || repo.length > 100 || !REPO.test(repo) || repo === '.' || repo === '..') {
    throw new SettingsError(
      'repo',
      "The repo is its name alone, like smart-scale-data: letters, digits, '.', '-' and '_'.",
    );
  }
  const branchText = draft.branch.trim();
  if (branchText !== '' && (BAD_BRANCH.test(branchText) || hasControlCharacter(branchText))) {
    throw new SettingsError('branch', `${branchText} isn't a branch name git accepts.`);
  }
  const pathPrefix = normalisePathPrefix(draft.pathPrefix);
  let token = storedToken;
  if (draft.token !== undefined) {
    token = draft.token === null ? null : draft.token.trim();
    if (token === '') token = null;
    if (token !== null && /\s/.test(token)) {
      throw new SettingsError('token', 'A token has no spaces in it: paste it again.');
    }
  }
  return { owner, repo, branch: branchText === '' ? null : branchText, pathPrefix, token };
}

/**
 * The folders in the repo to put the files in, as `a/b/`, or `''` for the top: slashes at
 * either end and doubled ones don't matter.
 *
 * @throws SettingsError for `.` or `..` as a folder, or control characters.
 */
export function normalisePathPrefix(prefix: string): string {
  const folders = prefix
    .split('/')
    .map((folder) => folder.trim())
    .filter((folder) => folder !== '');
  for (const folder of folders) {
    if (folder === '.' || folder === '..' || hasControlCharacter(folder)) {
      throw new SettingsError('pathPrefix', `The folder can't contain ${JSON.stringify(folder)}.`);
    }
  }
  return folders.length === 0 ? '' : `${folders.join('/')}/`;
}

function hasControlCharacter(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/** Whether uploading can start: owner, repo and token are set. */
export function isConfigured(settings: AutoExportSettings | null): settings is ConfiguredSettings {
  return (
    settings !== null && settings.owner !== '' && settings.repo !== '' && settings.token !== null
  );
}

/**
 * Where files go, as a key: the ledger's entries are for one destination, so changing the repo,
 * the branch or the folder uploads everything again (comparing first). GitHub's names ignore
 * case. The token isn't part of it: replacing a token changes nothing that was uploaded.
 */
export function destinationKey(settings: AutoExportSettings): string {
  return (
    `${settings.owner}/${settings.repo}`.toLowerCase() +
    `@${settings.branch ?? ''}:${settings.pathPrefix}`
  );
}

export function settingsView(settings: AutoExportSettings): AutoExportSettingsView {
  return {
    owner: settings.owner,
    repo: settings.repo,
    branch: settings.branch,
    pathPrefix: settings.pathPrefix,
    tokenSet: settings.token !== null,
  };
}

/**
 * The stored settings, or null if there are none.
 *
 * @throws StorageError if reading fails; Error if what is stored can't be read as settings.
 */
export async function loadSettings(local: LocalRepository): Promise<AutoExportSettings | null> {
  const value = await local.get(SETTINGS_KEY);
  if (value === undefined) return null;
  try {
    return parseSettings(value, 'settings');
  } catch (error) {
    // No cause, and only the path: a schema's message may quote a field's text, and no error
    // may carry the token (D-027).
    const where = error instanceof SchemaError ? error.path : 'settings';
    // eslint-disable-next-line preserve-caught-error -- see above
    throw new Error(
      `The stored automatic export settings can't be read (${where}): enter them again.`,
    );
  }
}

export async function storeSettings(
  local: LocalRepository,
  settings: AutoExportSettings,
): Promise<void> {
  await local.set(SETTINGS_KEY, { ...settings } satisfies Record<string, JsonValue>);
}
