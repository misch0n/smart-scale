// The scale in one line (T3.14, D-108): its icon, its name, its connection and its battery,
// on Home, the brew screen (while not connected) and Setup's containers. It reconnects by itself
// (every 0.5 s while the scale is off, `RETRY_DELAYS_MS`), so it offers no Stop and no Connect
// button: a tap on the name tries now (the chooser when no scale is known yet), a tap on the
// icon opens the chooser for another scale. Connected, a tap on the name renames it (T2.30).

import { useEffect, useRef, useState } from 'preact/hooks';
import type { ScaleLink } from '../app/links';
import { connectionView } from '../app/scale-connector';
import { SCALE_NAME_MAX, type ScaleNames } from '../app/scale-names';
import { CONNECTION_LABEL } from './brew/parts';
import { BatteryIcon, ScaleIcon } from './icons';
import { useLiveUpdates } from './use-live-updates';
import './scale-line.css';

/** The scale's line. `names` gives it the user's name, and renaming once connected. */
export function ScaleLine({
  link,
  names,
}: {
  link: Pick<ScaleLink, 'transport' | 'connector' | 'recorder'>;
  names: ScaleNames;
}) {
  const { transport, connector, recorder } = link;
  useLiveUpdates(
    (notify) => {
      const offs = [transport.onStatus(notify), connector.onChange(notify), names.onChange(notify)];
      return () => offs.forEach((off) => off());
    },
    [link, names],
  );
  const status = transport.status;
  const view = connectionView(status, connector.state);
  const connected = status.state === 'connected';
  const advertised = connected
    ? status.connection.device.name
    : (connector.state.known?.name ?? null);
  const battery = connected ? (recorder.state.stats?.lastWeight?.frame.batteryPct ?? null) : null;
  const label = names.label(advertised, 'Scale');
  return (
    <section class="card scale-line" aria-label="Scale" data-testid="scale" data-view={view}>
      <button
        type="button"
        class="scale-line-icon"
        aria-label="Choose scale"
        onClick={() => connector.choose()}
        data-testid="choose-scale"
      >
        <ScaleIcon />
      </button>
      {connected ? (
        <ScaleName names={names} advertised={advertised} />
      ) : (
        <button
          type="button"
          class="scale-name"
          // Without Web Bluetooth a tap reloads, which is what may bring it back (beacio).
          onClick={() => (view === 'unavailable' ? location.reload() : connector.connect())}
          aria-label={view === 'unavailable' ? 'Reload' : 'Connect scale'}
          title={connector.state.error ?? undefined}
          data-testid="scale-name"
        >
          {label}
        </button>
      )}
      <span class="muted scale-state" data-testid="scale-state">
        <span class={connected ? 'dot dot-ok' : 'dot dot-off'} />
        {CONNECTION_LABEL[view]}
      </span>
      {battery !== null && (
        <span
          class="muted scale-battery"
          role="img"
          aria-label={`Battery ${battery} %`}
          data-testid="battery"
        >
          <BatteryIcon pct={battery} />
          <span class="num">{battery}</span> %
        </span>
      )}
    </section>
  );
}

/**
 * The scale's name, connected (T2.30, D-102): the user's, else the one it advertises. A tap opens a
 * field to rename it; Enter or leaving the field keeps the name, Escape doesn't, and a blank name gives the
 * scale its own back. Kept in the settings for the next sessions (`ScaleNames`).
 */
function ScaleName({ names, advertised }: { names: ScaleNames; advertised: string | null }) {
  const [editing, setEditing] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  /** Escape: the field closes, and its blur as it goes keeps nothing. */
  const cancelled = useRef(false);
  // Into the field as it opens, for the keyboard to come up (autofocus only works on a load).
  useEffect(() => {
    if (editing) field.current?.focus();
  }, [editing]);
  const label = names.label(advertised, 'Scale');
  if (!editing) {
    return (
      <button
        type="button"
        class="scale-name"
        onClick={() => {
          // Here, not in the effect: that can run after a fast Escape, and undo it.
          cancelled.current = false;
          setEditing(true);
        }}
        aria-label={`${label}: rename`}
        data-testid="scale-name"
      >
        {label}
      </button>
    );
  }
  return (
    <input
      ref={field}
      class="input scale-name-input"
      type="text"
      aria-label="Scale name"
      value={names.nameOf(advertised) ?? ''}
      placeholder={advertised ?? 'Scale'}
      maxLength={SCALE_NAME_MAX}
      enterKeyHint="done"
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          cancelled.current = true;
          setEditing(false);
        }
      }}
      onBlur={(event) => {
        if (!cancelled.current) names.rename(advertised, event.currentTarget.value);
        setEditing(false);
      }}
      data-testid="scale-name-input"
    />
  );
}
