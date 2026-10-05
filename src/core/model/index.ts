/**
 * The data model that storage, export, analysis and the UI share: record types, ids,
 * constructors and normalisers. docs/ARCHITECTURE.md "Data model" describes it, and D-007,
 * D-017 to D-019 and D-074 (the entities) explain the choices.
 *
 * Every record carries every field. `null` means "not set", "hidden" or "not applicable"; a
 * field is never missing (spec "Schema rules"). The normalisers enforce that on anything read
 * from storage or an import.
 *
 * Time conventions:
 * - `tMs`: ms since the recording started, on the recorder's monotonic clock, as a float.
 *   Frames, app events and shot anchors all use it.
 * - `…EpochMs`: wall-clock ms since 1970, as `Date.now()` returns.
 * - Durations in seconds appear only in derived metrics.
 */

export * from './entities';
export * from './events';
export * from './frame';
export * from './ids';
export * from './legacy-settings';
export * from './recording';
export * from './schema';
export * from './seeds';
export * from './sequence';
export * from './shot';
export * from './snapshot';
