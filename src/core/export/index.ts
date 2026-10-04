/**
 * The export format (T1.7): the durable artifact that holds raw recordings verbatim, with their
 * metadata. docs/export-format.md is normative, and D-025 explains the choices.
 *
 * - `serialiseExport(bundle)` writes a file; `parseExport(text)` reads one, upgrading an older
 *   version through `EXPORT_MIGRATIONS`.
 * - `recordingExportFileName` and `allExportFileName` name the files.
 *
 * Reading and writing storage, and the import's merge rules, are `src/app/export.ts`.
 */

export * from './file-name';
export * from './format';
export { parseExport, type ParsedExport, type ParseExportOptions } from './parse';
export { serialiseExport } from './serialise';
export type { EventEntry, ExportDocument, FrameRow, RecordingEntry } from './document';
