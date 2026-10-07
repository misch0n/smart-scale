import { useEffect, useState } from 'preact/hooks';
import { linkKey } from '../app/links';
import { startApp, type AppServices } from '../app/startup';
import { StorageError } from '../app/storage';
import { BUILD_INFO } from '../platform/build-info';
import { BrewScreen } from './brew/BrewScreen';
import { HistoryScreen } from './history/HistoryScreen';
import { ShotScreen } from './history/ShotScreen';
import { HomeScreen } from './home/HomeScreen';
import { EnvironmentPanel } from './probe/EnvironmentPanel';
import { ProbeScreen } from './probe/ProbeScreen';
import { linkSpecFor, useRoute } from './route';
import { SetupScreen } from './setup/SetupScreen';

// The app shell: start the services, then show the page the route names: Home (T1.23), the brew
// flow (T1.18), the history, a shot or two compared (T1.19), Setup and its screens (T2.9), or
// the probe (T1.8), a row in Setup (D-072). Every page but the brew flow's has the tab bar.
export function App() {
  const route = useRoute();
  const startup = useStartup();
  useWakeLockRetry(startup.state === 'ready' ? startup.services : null);
  if (startup.state === 'ready') {
    const { services } = startup;
    // Keyed by link and shots, so switching between the scale and the mock, or to another shot,
    // starts the screen afresh.
    const key = [
      route.page,
      linkKey(linkSpecFor(route)),
      ...route.shotIds,
      route.setup === null ? null : JSON.stringify(route.setup),
    ].join(':');
    switch (route.page) {
      case 'home':
        return <HomeScreen key={key} services={services} route={route} />;
      case 'brew':
        return <BrewScreen key={key} services={services} route={route} />;
      case 'history':
        return <HistoryScreen key={key} services={services} route={route} />;
      case 'shot':
        return <ShotScreen key={key} services={services} route={route} />;
      case 'setup':
        return <SetupScreen key={key} services={services} route={route} />;
      case 'probe':
        return <ProbeScreen key={key} services={services} route={route} />;
    }
  }
  return (
    <main class="probe">
      <h1>Espresso tracker</h1>
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

/**
 * Every tap asks again for a screen wake lock that is wanted but not held. Safari grants it only
 * during a tap, so a scale that reconnected by itself (T1.21) gets it at the next one. Taps
 * that connect acquire it themselves.
 */
function useWakeLockRetry(services: AppServices | null): void {
  useEffect(() => {
    if (services === null) return;
    const retry = (): void => services.wakeLock.retry();
    document.addEventListener('click', retry);
    return () => document.removeEventListener('click', retry);
  }, [services]);
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
