import { useEffect, useState } from 'preact/hooks';
import {
  EXPORT_MEDIA_TYPE,
  exportAll,
  exportRecording,
  importBundle,
  summariseBundle,
  type ExportFile,
  type ExportSummary,
  type ImportReport,
} from '../app/export';
import type { AppStorage } from '../app/storage';
import { parseExport } from '../core/export';
import { shortId, type Recording } from '../core/model';
import { BUILD_INFO } from '../platform/build-info';
import { canShareFile, shareFile } from '../platform/share';

// Manual export and import (T1.7). Rudimentary until T3.5. Exporting takes two taps: the first
// builds the file, the second downloads or shares it. The share sheet needs the tap's user
// activation, which building a large file could use up.

interface Prepared {
  readonly file: File;
  /** A blob URL for the download link, revoked when the file is replaced. */
  readonly url: string;
  readonly summary: ExportSummary;
  readonly canShare: boolean;
}

interface Imported {
  readonly fileName: string;
  readonly formatVersion: number;
  readonly summary: ExportSummary;
  readonly report: ImportReport;
}

export function ExportPanel({ storage }: { storage: AppStorage }) {
  const [recordings, setRecordings] = useState<readonly Recording[] | null>(null);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [imported, setImported] = useState<Imported | null>(null);
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = (): Promise<void> =>
    storage.recordings.list().then(setRecordings, (error: unknown) => setMessage(text(error)));

  useEffect(() => {
    void refresh();
  }, [storage]);

  // Revoke a prepared file's URL once another replaces it, or the panel goes away.
  useEffect(() => (prepared ? () => URL.revokeObjectURL(prepared.url) : undefined), [prepared]);

  async function prepare(make: () => Promise<ExportFile>): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const exported = await make();
      const file = new File([exported.text], exported.fileName, { type: EXPORT_MEDIA_TYPE });
      setPrepared({
        file,
        url: URL.createObjectURL(file),
        summary: exported.summary,
        canShare: canShareFile(navigator, file),
      });
    } catch (error) {
      setMessage(`Export failed: ${text(error)}`);
    } finally {
      setBusy(false);
    }
  }

  function share(file: File): void {
    // Nothing may be awaited before this: the share sheet needs the tap's user activation.
    shareFile(navigator, file).then(
      (outcome) => setMessage(outcome === 'shared' ? 'Shared.' : 'Sharing cancelled.'),
      (error: unknown) => setMessage(`Sharing failed: ${text(error)}`),
    );
  }

  async function importFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = ''; // so that choosing the same file again imports it again
    if (!file) return;
    setBusy(true);
    setMessage(null);
    setImported(null);
    try {
      const parsed = parseExport(await file.text());
      const report = await importBundle(storage, parsed.bundle, {
        metadata: replace ? 'replace' : 'keep',
      });
      setImported({
        fileName: file.name,
        formatVersion: parsed.formatVersion,
        summary: summariseBundle(parsed.bundle),
        report,
      });
      await refresh();
    } catch (error) {
      setMessage(`Import failed: ${text(error)}`);
    } finally {
      setBusy(false);
    }
  }

  const options = { app: BUILD_INFO };
  return (
    <section>
      <h2>Recordings</h2>
      {recordings === null ? (
        <p>Loading…</p>
      ) : recordings.length === 0 ? (
        <p>No recordings stored.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Recording</th>
              <th>Ended</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {recordings.map((recording) => (
              <tr key={recording.id}>
                <td>
                  {new Date(recording.startedAtEpochMs).toLocaleString()}
                  <br />
                  <span class="muted">
                    <code>{shortId(recording.id)}</code> ·{' '}
                    {[recording.transport, recording.device.name].filter(Boolean).join(' · ')}
                  </span>
                </td>
                <td>{recording.endReason ?? 'open'}</td>
                <td>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void prepare(() => exportRecording(storage, recording.id, options))
                    }
                  >
                    Export
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void prepare(() => exportAll(storage, options))}
        >
          Export all
        </button>
      </p>
      {prepared && (
        <div class="box" data-testid="export-ready">
          <p>
            Ready: <code>{prepared.file.name}</code> ({kilobytes(prepared.file.size)}):{' '}
            {describeSummary(prepared.summary)}.
          </p>
          <p>
            <a href={prepared.url} download={prepared.file.name}>
              Download
            </a>
            {prepared.canShare && (
              <>
                {' · '}
                <button type="button" onClick={() => share(prepared.file)}>
                  Share…
                </button>
              </>
            )}
          </p>
        </div>
      )}

      <h2>Import</h2>
      <p>
        <label>
          <input
            type="checkbox"
            checked={replace}
            onChange={(event) => setReplace(event.currentTarget.checked)}
          />{' '}
          Replace stored shots and settings with the file's. Stored recordings are never replaced.
        </label>
      </p>
      <p>
        <input
          type="file"
          accept=".json,application/json"
          disabled={busy}
          aria-label="Import an export file"
          onChange={(event) => void importFile(event.currentTarget)}
        />
      </p>
      {imported && <ImportResult imported={imported} />}
      {message && (
        <p class="box" role="status">
          {message}
        </p>
      )}
    </section>
  );
}

function ImportResult({ imported }: { imported: Imported }) {
  const { recordings, shots, settings } = imported.report;
  const added = recordings.filter((r) => r.outcome === 'imported');
  const unclean = added.filter((r) => r.endedUnclean);
  const partial = recordings.filter((r) => r.recordsNotImported > 0);
  const ids = (list: readonly { readonly id: string }[]) =>
    list.map((r) => shortId(r.id)).join(', ');
  return (
    <div class="box" data-testid="import-result">
      <p>
        Imported <code>{imported.fileName}</code> (format version {imported.formatVersion}):{' '}
        {describeSummary(imported.summary)}.
      </p>
      <ul>
        <li>
          Recordings: {added.length} added, {recordings.length - added.length} already stored.
        </li>
        {unclean.length > 0 && (
          <li>Still recording when exported, so stored as ended (unclean): {ids(unclean)}.</li>
        )}
        {partial.map((r) => (
          <li key={r.id}>
            Recording {shortId(r.id)} was already stored, but the file has {r.recordsNotImported}{' '}
            records more. They weren't imported: a stored recording never changes.
          </li>
        ))}
        <li>Shots: {describeCounts(shots)}.</li>
        {shots.conflicts.length > 0 && (
          <li>
            Left alone, because the stored shot is a different one with the same id:{' '}
            {shots.conflicts.map(shortId).join(', ')}.
          </li>
        )}
        {shots.withoutRecording > 0 && (
          <li>{shots.withoutRecording} shots belong to recordings that aren't stored.</li>
        )}
        <li>Settings: {describeCounts(settings)}.</li>
      </ul>
    </div>
  );
}

function describeSummary(summary: ExportSummary): string {
  const parts = [
    `${summary.recordings} recordings`,
    `${summary.frames} frames`,
    `${summary.events} events`,
    `${summary.shots} shots`,
  ];
  if (summary.settings !== null) parts.push(`${summary.settings} settings`);
  return parts.join(', ');
}

function describeCounts(counts: ImportReport['settings']): string {
  return `${counts.added} added, ${counts.unchanged} unchanged, ${counts.kept} kept (the file's differ), ${counts.replaced} replaced`;
}

function kilobytes(bytes: number): string {
  return `${(bytes / 1000).toFixed(1)} kB`;
}

function text(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
