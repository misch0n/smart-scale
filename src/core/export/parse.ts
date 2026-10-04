/**
 * Reads an export file (docs/export-format.md): checks that it is one, refuses a newer format
 * version with a clear message, upgrades an older one through the migrations, and validates every
 * record with the model's normalisers (D-018).
 */

import { SchemaError } from '../model';
import { fromDocument, isPlainObject } from './document';
import {
  EXPORT_FORMAT,
  EXPORT_MIGRATIONS,
  ExportFormatError,
  type ExportBundle,
  type ExportMigration,
} from './format';

export interface ParseExportOptions {
  /** The format's migrations. Default `EXPORT_MIGRATIONS`; tests pass their own. */
  readonly migrations?: readonly ExportMigration[];
}

export interface ParsedExport {
  /** The file's own format version, before any migration. */
  readonly formatVersion: number;
  /** What the file holds, in the current version's terms. */
  readonly bundle: ExportBundle;
}

/**
 * Reads an export file's text. A byte order mark at the start is ignored.
 *
 * @throws ExportFormatError `not-json`, `not-an-export`, `newer-version` (the message says to
 *   reload the app) or `invalid` (the message names the place, like
 *   `recordings[0].frames[12][3]`).
 */
export function parseExport(text: string, options: ParseExportOptions = {}): ParsedExport {
  const migrations = options.migrations ?? EXPORT_MIGRATIONS;
  const currentVersion = migrations.length + 1;

  let value: unknown;
  try {
    value = JSON.parse(text.startsWith('\uFEFF') ? text.slice(1) : text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new ExportFormatError('not-json', `The file isn't JSON: ${reason}`, { cause: error });
  }
  if (!isPlainObject(value) || value.format !== EXPORT_FORMAT) {
    throw new ExportFormatError(
      'not-an-export',
      `The file isn't a smart-scale export: it has no "format": "${EXPORT_FORMAT}".`,
    );
  }

  const version = value.formatVersion;
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1) {
    const shown = version === undefined ? 'missing' : JSON.stringify(version);
    throw new ExportFormatError(
      'invalid',
      `The file isn't a valid export: formatVersion should be a whole number from 1, but it is ${shown}.`,
    );
  }
  if (version > currentVersion) {
    throw new ExportFormatError(
      'newer-version',
      `The file is export format version ${version}, but this build of the app reads versions up ` +
        `to ${currentVersion}. A newer build wrote it: reload the app to update it, then import ` +
        'the file again.',
    );
  }

  try {
    let document: Readonly<Record<string, unknown>> = value;
    for (let from = version; from < currentVersion; from++) {
      document = migrations[from - 1](document);
    }
    return { formatVersion: version, bundle: fromDocument(document) };
  } catch (error) {
    if (!(error instanceof SchemaError)) throw error;
    throw new ExportFormatError('invalid', `The file isn't a valid export: ${error.message}`, {
      cause: error,
    });
  }
}
