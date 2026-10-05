// The tab bar (spec v2 "App structure and look"; every board's `tabbar`): Home, Brew, History
// and Setup. The brew phases hide it (focus mode). Until the Setup screens (T2.9), Setup is the
// probe: export, automatic export, the microphone's levels and the diagnostics (D-072). Its
// links keep `?mock`, so the simulator stays on across the tabs.

import { BrewIcon, HistoryIcon, HomeIcon, SetupIcon } from './icons';
import { pageHash, type Mock } from './route';

export type Tab = 'home' | 'brew' | 'history' | 'setup';

const TABS: readonly {
  readonly id: Tab;
  readonly label: string;
  readonly page: 'home' | 'brew' | 'history' | 'probe';
  readonly Icon: typeof HomeIcon;
}[] = [
  { id: 'home', label: 'Home', page: 'home', Icon: HomeIcon },
  { id: 'brew', label: 'Brew', page: 'brew', Icon: BrewIcon },
  { id: 'history', label: 'History', page: 'history', Icon: HistoryIcon },
  { id: 'setup', label: 'Setup', page: 'probe', Icon: SetupIcon },
];

export function TabBar({ current, mock }: { current: Tab; mock: Mock }) {
  return (
    <nav class="tabbar" aria-label="Main" data-testid="tabbar">
      {TABS.map(({ id, label, page, Icon }) => (
        <a
          key={id}
          class={id === current ? 'tab on' : 'tab'}
          href={pageHash(page, mock)}
          aria-current={id === current ? 'page' : undefined}
          data-testid={`tab-${id}`}
        >
          <Icon />
          {label}
        </a>
      ))}
    </nav>
  );
}
