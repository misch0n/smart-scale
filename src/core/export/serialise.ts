/**
 * Writes an export file (docs/export-format.md). The layout is part of the format's design, not
 * of its definition: any valid JSON with the same content reads the same.
 *
 * - One record per line: each frame row, event and shot, and the recording, compact. Tools that
 *   work line by line (grep, sed, diff, an agent reading part of a file) see whole records, and
 *   a fixture's git diff shows the records that changed.
 * - The structure around them is indented by one space per level, which keeps a frame to about
 *   80 bytes: three minutes at 10 Hz is under 150 KB.
 * - The file ends with a newline.
 */

import { toDocument, type ExportDocument } from './document';
import type { ExportBundle } from './format';

/**
 * The export file for a bundle, as text. Every record is normalised first, so the file carries
 * every field, `null` included.
 *
 * @throws SchemaError if the bundle is malformed (see `toDocument`): a programming error.
 */
export function serialiseExport(bundle: ExportBundle): string {
  return `${layout(toDocument(bundle)).join('\n')}\n`;
}

/**
 * A value's lines. The first line carries no indentation, because the caller puts it after a key
 * or indents it as an array item; the rest are indented in full.
 */
type Lines = readonly string[];

const INDENT = ' ';

function layout(document: ExportDocument): Lines {
  const settings = document.settings;
  return objectLines(
    [
      ['format', compact(document.format)],
      ['formatVersion', compact(document.formatVersion)],
      ['exportedAtEpochMs', compact(document.exportedAtEpochMs)],
      ['app', compact(document.app)],
      [
        'recordings',
        arrayLines(
          document.recordings.map((entry) =>
            objectLines(
              [
                ['recording', compact(entry.recording)],
                ['frames', arrayLines(entry.frames.map(compact), 3)],
                ['events', arrayLines(entry.events.map(compact), 3)],
              ],
              2,
            ),
          ),
          1,
        ),
      ],
      ['shots', arrayLines(document.shots.map(compact), 1)],
      [
        'settings',
        settings === null
          ? compact(null)
          : objectLines(
              Object.keys(settings)
                .sort()
                .map((key) => [key, compact(settings[key])]),
              1,
            ),
      ],
    ],
    0,
  );
}

/**
 * Characters that some tools take for a line break although JSON.stringify leaves them as they
 * are: NEL, LINE SEPARATOR and PARAGRAPH SEPARATOR (Python's `splitlines()` breaks on all
 * three). They can only occur inside strings, where an escape reads back as the same character.
 */
const LINE_BREAKERS = /[\u0085\u2028\u2029]/g;

/** A value as compact JSON, on one line. */
function json(value: unknown): string {
  return JSON.stringify(value).replace(
    LINE_BREAKERS,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}

/** A value on one line, as compact JSON. */
function compact(value: unknown): Lines {
  return [json(value)];
}

/** An object at nesting depth `depth`, its members one level deeper. */
function objectLines(members: readonly (readonly [string, Lines])[], depth: number): Lines {
  if (members.length === 0) return ['{}'];
  const inner = INDENT.repeat(depth + 1);
  const items = members.map(([key, value]) => [
    `${inner}${json(key)}: ${value[0]}`,
    ...value.slice(1),
  ]);
  return ['{', ...withCommas(items), `${INDENT.repeat(depth)}}`];
}

/** An array at nesting depth `depth`, its items one level deeper. */
function arrayLines(values: readonly Lines[], depth: number): Lines {
  if (values.length === 0) return ['[]'];
  const inner = INDENT.repeat(depth + 1);
  const items = values.map((value) => [`${inner}${value[0]}`, ...value.slice(1)]);
  return ['[', ...withCommas(items), `${INDENT.repeat(depth)}]`];
}

/** The items' lines in order, with a comma after each item but the last. */
function withCommas(items: readonly (readonly string[])[]): string[] {
  const out: string[] = [];
  items.forEach((lines, i) => {
    out.push(...lines);
    if (i < items.length - 1) out[out.length - 1] += ',';
  });
  return out;
}
