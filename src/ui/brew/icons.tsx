// The mockups' stroke icons (design/ui-exploration/canvas/), 24 px on a 24 grid, in the
// current colour. Decorative: whatever names the control carries the label.

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
