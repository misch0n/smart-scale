// The mockups' stroke icons (design/ui-exploration/canvas/), 24 px on a 24 grid, in the
// current colour. Decorative: whatever names the control carries the label. Shared by every
// screen: the brew boards' and Home's, and the tab bar's.

import type { JSX } from 'preact';

type IconProps = { readonly size?: number; readonly strokeWidth?: number; readonly class?: string };

function icon(paths: JSX.Element) {
  return function Icon({ size = 24, strokeWidth, class: className }: IconProps) {
    return (
      <svg
        class={className ? `ico ${className}` : 'ico'}
        viewBox="0 0 24 24"
        style={{ width: `${size}px`, height: `${size}px`, strokeWidth }}
        aria-hidden="true"
      >
        {paths}
      </svg>
    );
  };
}

export const CloseIcon = icon(<path d="M6 6l12 12M18 6 6 18" />);
export const CheckIcon = icon(<path d="M5 12.5l4.5 4.5L19 7.5" />);
export const ChevronDownIcon = icon(<path d="M6 9l6 6 6-6" />);
export const ChevronUpIcon = icon(<path d="M6 15l6-6 6 6" />);
export const PlusIcon = icon(<path d="M12 5v14M5 12h14" />);
export const WarningIcon = icon(
  <>
    <path d="M12 4 2.5 20h19z" />
    <path d="M12 10v4M12 17h.01" />
  </>,
);
export const MicOffIcon = icon(
  <>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3M4 4l16 16" />
  </>,
);

// The tab bar's (every board's `tabbar`).
export const HomeIcon = icon(
  <>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
  </>,
);
export const BrewIcon = icon(
  <>
    <path d="M4 8h13v5a6 6 0 0 1-6 6h-1a6 6 0 0 1-6-6z" />
    <path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17" />
    <path d="M8 3v2M12 3v2" />
  </>,
);
export const HistoryIcon = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>,
);
export const SetupIcon = icon(
  <>
    <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" />
    <circle cx="16" cy="6" r="2" />
    <circle cx="10" cy="12" r="2" />
    <circle cx="18" cy="18" r="2" />
  </>,
);

// Home's scale card (board Main).
export const ScaleIcon = icon(
  <>
    <path d="M4 8.5h16" />
    <rect x="3" y="11.5" width="18" height="7.5" rx="1.5" />
    <path d="M9.5 15.25h5" />
  </>,
);

/** The battery, with a bar per started quarter of its charge (the board draws four at 82 %). */
export function BatteryIcon({ pct, size = 20 }: { readonly pct: number; readonly size?: number }) {
  const bars = Math.min(4, Math.max(0, Math.ceil(pct / 25)));
  return (
    <svg
      class="ico"
      viewBox="0 0 24 24"
      style={{ width: `${size}px`, height: `${size}px` }}
      aria-hidden="true"
    >
      <rect x="2.5" y="7.5" width="16" height="9" rx="1.5" />
      <path d="M21.5 10.5v3" />
      {bars > 0 && (
        <path
          d={[5.5, 8.5, 11.5, 14.5]
            .slice(0, bars)
            .map((x) => `M${x} 10.5v3`)
            .join('')}
        />
      )}
    </svg>
  );
}
