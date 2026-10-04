import { useEffect, useState } from 'preact/hooks';
import { openStorage, type AppStorage } from '../app/storage';
import { BUILD_INFO } from '../platform/build-info';
import { detectCapabilities } from '../platform/capabilities';
import { ExportPanel } from './ExportPanel';

// Placeholder home page (T0.2). Until the probe screen exists (T1.8), its job is to show which
// browser APIs the runtime exposes (hardware test B1), and to export and import recordings
// (T1.7).
export function App() {
  const capabilities = detectCapabilities(globalThis);
  const storage = useStorage();

  return (
    <main>
      <h1>Espresso tracker</h1>
      <p>No scale features yet. This page shows what this browser supports.</p>

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

      {storage.state === 'open' ? (
        <ExportPanel storage={storage.storage} />
      ) : (
        <p class="box">{storage.state === 'opening' ? 'Opening storage…' : storage.message}</p>
      )}

      <p class="muted">
        Build {BUILD_INFO.commit} · {BUILD_INFO.buildTime}
      </p>
      <p class="muted">{navigator.userAgent}</p>
    </main>
  );
}

type StorageState =
  | { readonly state: 'opening' }
  | { readonly state: 'open'; readonly storage: AppStorage }
  | { readonly state: 'failed'; readonly message: string };

/** Opens the database once, and closes it when the page's app goes away. */
function useStorage(): StorageState {
  const [state, setState] = useState<StorageState>({ state: 'opening' });
  useEffect(() => {
    let opened: AppStorage | null = null;
    let cancelled = false;
    openStorage({
      onBlocked: () =>
        setState({
          state: 'failed',
          message:
            'Waiting for storage: close the app in your other tabs. One holds an older version of the database open.',
        }),
    }).then(
      (storage) => {
        if (cancelled) {
          storage.close();
          return;
        }
        opened = storage;
        setState({ state: 'open', storage });
      },
      (error: unknown) => {
        if (cancelled) return;
        const reason = error instanceof Error ? error.message : String(error);
        setState({ state: 'failed', message: `Storage isn't available: ${reason}` });
      },
    );
    return () => {
      cancelled = true;
      opened?.close();
    };
  }, []);
  return state;
}
