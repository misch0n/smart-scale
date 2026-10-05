import { useEffect, useState } from 'preact/hooks';
import { linkKey } from '../app/links';
import { startApp, type AppServices } from '../app/startup';
import { StorageError } from '../app/storage';
import { BUILD_INFO } from '../platform/build-info';
import { BrewScreen } from './brew/BrewScreen';
import { EnvironmentPanel } from './probe/EnvironmentPanel';
import { ProbeScreen } from './probe/ProbeScreen';
import { linkSpecFor, useRoute } from './route';

// The app shell: start the services, then show the page the route names: the brew flow (T1.18)
// or the probe (T1.8). Home and the tab bar come with T1.23.
export function App() {
  const route = useRoute();
  const startup = useStartup();
  if (startup.state === 'ready') {
    // Keyed by link, so switching between the scale and the mock starts the screen afresh.
    const key = `${route.page}:${linkKey(linkSpecFor(route))}`;
    return route.page === 'brew' ? (
      <BrewScreen key={key} services={startup.services} route={route} />
    ) : (
      <ProbeScreen key={key} services={startup.services} route={route} />
    );
  }
  return (
    <main class="probe">
      <h1>Probe</h1>
      <p class={startup.state === 'failed' ? 'box warn' : 'box'} data-testid="startup">
        {startup.state === 'failed'
          ? startup.message
          : startup.blocked
            ? 'Waiting for storage: close the app in your other tabs. One holds an older version of the database open.'
            : 'Opening storage…'}
      </p>
      <EnvironmentPanel persistence={null} recovery={null} recoveryError={null} />
    </main>
  );
}

type StartupState =
  | { readonly state: 'starting'; readonly blocked: boolean }
  | { readonly state: 'ready'; readonly services: AppServices }
  | { readonly state: 'failed'; readonly message: string };

/**
 * Starts the app's services once: storage, the persistence request, unclean recovery, then the
 * links to the scale. They live as long as the page; a recorder can't be detached (D-024).
 */
function useStartup(): StartupState {
  const [state, setState] = useState<StartupState>({ state: 'starting', blocked: false });
  useEffect(() => {
    let cancelled = false;
    startApp({
      app: BUILD_INFO,
      userAgent: navigator.userAgent,
      storage: {
        onBlocked: () => {
          if (!cancelled) setState({ state: 'starting', blocked: true });
        },
      },
    }).then(
      (services) => {
        if (cancelled) {
          services.autoExport.dispose();
          services.storage.close();
        } else {
          setState({ state: 'ready', services });
        }
      },
      (error: unknown) => {
        if (!cancelled) setState({ state: 'failed', message: startupFailure(error) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

function startupFailure(error: unknown): string {
  if (error instanceof StorageError && error.code === 'newer-version') {
    return 'A newer version of the app has upgraded the stored data. Reload the page to get it.';
  }
  const reason = error instanceof Error ? error.message : String(error);
  return `Storage isn't available, so nothing can be recorded: ${reason}`;
}
