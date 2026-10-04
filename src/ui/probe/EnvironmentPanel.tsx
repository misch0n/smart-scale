import type { PersistenceStatus } from '../../app/storage';
import type { RecoveryResult } from '../../app/recovery';
import { shortId } from '../../core/model';
import { BUILD_INFO } from '../../platform/build-info';
import { detectCapabilities } from '../../platform/capabilities';
import { size } from './format';

// What the runtime offers (hardware test B1), whether storage persists (B6), and what startup
// recovery did (D-024). Shown even when storage failed to open, so the failure can be reported.

export function EnvironmentPanel({
  persistence,
  recovery,
  recoveryError,
}: {
  persistence: PersistenceStatus | null;
  recovery: RecoveryResult | null;
  recoveryError: string | null;
}) {
  const capabilities = detectCapabilities(globalThis);
  return (
    <section>
      <h2>This browser</h2>
      <table>
        <thead>
          <tr>
            <th>Capability</th>
            <th>Available</th>
            <th>Used for</th>
          </tr>
        </thead>
        <tbody>
          {capabilities.map((c) => (
            <tr key={c.id}>
              <td>{c.label}</td>
              <td class={c.available ? 'yes' : 'no'}>{c.available ? 'yes' : 'no'}</td>
              <td>{c.usedFor}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {persistence && <Persistence status={persistence} />}
      {(recovery || recoveryError) && <Recovery result={recovery} error={recoveryError} />}
      <p class="muted">
        Build {BUILD_INFO.commit} · {BUILD_INFO.buildTime}
      </p>
      <p class="muted">{navigator.userAgent}</p>
    </section>
  );
}

function Persistence({ status }: { status: PersistenceStatus }) {
  const answer = !status.supported
    ? "not supported: the browser may evict this site's data"
    : status.persisted === true
      ? 'granted: the browser keeps the data when space runs low'
      : status.persisted === false
        ? 'not granted: the browser may evict the data when space runs low'
        : 'unknown';
  const usage =
    status.usageBytes === null
      ? null
      : `Using ${size(status.usageBytes)}${status.quotaBytes === null ? '' : ` of ${size(status.quotaBytes)}`}.`;
  return (
    <p data-testid="persistence">
      Persistent storage: {answer}.{usage && <> {usage}</>}
      {status.error && <> Error: {status.error}.</>}
    </p>
  );
}

function Recovery({ result, error }: { result: RecoveryResult | null; error: string | null }) {
  if (error !== null || result === null) {
    return <p class="box warn">Recordings left open couldn't be checked: {error}</p>;
  }
  const { ended, skipped, failed } = result;
  if (ended.length + skipped.length + failed.length === 0) {
    return <p data-testid="recovery">No recordings were left open.</p>;
  }
  return (
    <ul data-testid="recovery">
      {ended.length > 0 && (
        <li>
          Ended as unclean (the app stopped while recording):{' '}
          {ended.map((r) => shortId(r.id)).join(', ')}.
        </li>
      )}
      {skipped.length > 0 && (
        <li>Left open, another tab is recording: {skipped.map(shortId).join(', ')}.</li>
      )}
      {failed.map((f) => (
        <li key={f.id} class="no">
          Couldn't end {shortId(f.id)}: {f.error.message}
        </li>
      ))}
    </ul>
  );
}
