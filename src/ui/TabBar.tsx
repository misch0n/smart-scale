// The tab bar (spec v2 "App structure and look"; every board's `tabbar`): Home, Brew, History
// and Setup (T2.9), under which the probe is a row (D-072). The brew phases hide it (focus mode).
// Its links keep `?mock`, so the simulator stays on across the tabs.

import { BrewIcon, HistoryIcon, HomeIcon, SetupIcon } from './icons';
import { pageHash, setupHash, type Mock } from './route';

export type Tab = 'home' | 'brew' | 'history' | 'setup';

const TABS: readonly {
  readonly id: Tab;
  readonly label: string;
  readonly href: (mock: Mock) => string;
  readonly Icon: typeof HomeIcon;
}[] = [
  { id: 'home', label: 'Home', href: (mock) => pageHash('home', mock), Icon: HomeIcon },
  { id: 'brew', label: 'Brew', href: (mock) => pageHash('brew', mock), Icon: BrewIcon },
  {
    id: 'history',
    label: 'History',
    href: (mock) => pageHash('history', mock),
    Icon: HistoryIcon,
  },
  {
    id: 'setup',
    label: 'Setup',
    href: (mock) => setupHash({ section: 'list' }, mock),
    Icon: SetupIcon,
  },
];

export function TabBar({ current, mock }: { current: Tab; mock: Mock }) {
  return (
    <nav class="tabbar" aria-label="Main" data-testid="tabbar">
      {TABS.map(({ id, label, href, Icon }) => (
        <a
          key={id}
          class={id === current ? 'tab on' : 'tab'}
          href={href(mock)}
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
