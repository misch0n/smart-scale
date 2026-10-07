// The containers (T2.9, T2.4; board Setup-Containers; spec v2 "Containers", "Brew phases"): each
// learned once by putting it on the scale empty, with its roles (bean cup, cup, milk
// jug; one container can have several), or as a scale accessory, like the mat on the scale
// (T2.17: a role of its own, which no other goes with). The scale recognises them by mass, so
// two that weigh the same are a conflict to resolve, and two within 3 g a warning the user can
// dismiss: a wet one weighs more (`containerClashes`). Lightest first, as the board lists them.
// While this screen shows, the scale is tared whenever nothing is on it (T2.20).

import { useEffect, useState } from 'preact/hooks';
import { tareWhileEmpty } from '../../app/empty-scale-tare';
import type { ScaleLink } from '../../app/links';
import { connectionView } from '../../app/scale-connector';
import type { AppServices } from '../../app/startup';
import {
  CONTAINER_ROLES,
  containerClashes,
  isListed,
  MIN_CONTAINER_G,
  type Container,
  type ContainerClash,
  type ContainerRole,
  type EntityChanges,
} from '../../core/model';
import { tenths } from '../brew/format';
import { ConnectBody } from '../brew/parts';
import { WarningIcon } from '../icons';
import { linkSpecFor, setupHash, type Route } from '../route';
import { useLiveUpdates } from '../use-live-updates';
import { OFFERED_ROLES, ROLE_LABEL, toggledRole } from './format';
import { SetupPage, TextField, useSetupUpdates } from './parts';

export function ContainersScreen({ services, route }: { services: AppServices; route: Route }) {
  useSetupUpdates(services);
  const { entities } = services;
  const link = services.links.get(linkSpecFor(route));
  // The scale tared while nothing is on it: what goes on reads as on the scale (T2.20).
  useEffect(() => tareWhileEmpty(link), [link]);
  const containers = entities.value.containers
    .filter(isListed)
    .sort((a, b) => a.emptyMassG - b.emptyMassG);
  const clashes = containerClashes(entities.value.containers);
  const open = clashes.filter((clash) => !clash.dismissed);
  const dismissed = clashes.length - open.length;
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <SetupPage
      title="Containers"
      back={{ href: setupHash({ section: 'list' }, route.mock), label: 'Setup' }}
      mock={route.mock}
      services={services}
      testId="setup-containers-screen"
    >
      {open.map((clash) => (
        <ClashNotice
          key={`${clash.a.id}-${clash.b.id}`}
          clash={clash}
          onDismiss={() =>
            entities.update('containers', clash.a.id, (a) => ({
              dismissedWarningIds: [...a.dismissedWarningIds, clash.b.id],
            }))
          }
        />
      ))}
      {dismissed > 0 && (
        <p class="muted setup-note">
          {dismissed} {dismissed === 1 ? 'warning' : 'warnings'} dismissed
        </p>
      )}

      {containers.length > 0 && (
        <section class="card" aria-label="Containers, lightest first">
          {containers.map((container) => (
            <ContainerRow
              key={container.id}
              container={container}
              clashes={clashes}
              open={editing === container.id}
              onToggle={() => setEditing(editing === container.id ? null : container.id)}
              services={services}
              link={link}
            />
          ))}
        </section>
      )}
      <p class="muted setup-note">
        The nearest container wins. Same weight = conflict. Within 3 g = warning.
      </p>

      <AddContainer services={services} link={link} />
    </SetupPage>
  );
}

function ClashNotice({ clash, onDismiss }: { clash: ContainerClash; onDismiss: () => void }) {
  const { a, b } = clash;
  if (clash.kind === 'same') {
    return (
      <section class="card notice warn clash" aria-label="Conflict" data-testid="clash">
        <WarningIcon size={20} class="c-warn" />
        <span class="clash-body">
          <span>
            <strong class="c-warn">
              {a.name} and {b.name} weigh the same.
            </strong>{' '}
            The scale can't tell them apart: weigh one again, or remove one.
          </span>
        </span>
      </section>
    );
  }
  return (
    <section class="card notice caution clash" aria-label="Warning" data-testid="clash">
      <WarningIcon size={20} class="c-caution" />
      <span class="clash-body">
        <span>
          <strong class="c-caution">
            {a.name} and {b.name} are {tenths(clash.gapG)} g apart.
          </strong>{' '}
          A wet {a.name} may read as {b.name}.
        </span>
        <button type="button" class="btn2" onClick={onDismiss} data-testid="dismiss">
          Dismiss
        </button>
      </span>
    </section>
  );
}

function ContainerRow({
  container,
  clashes,
  open,
  onToggle,
  services,
  link,
}: {
  container: Container;
  clashes: readonly ContainerClash[];
  open: boolean;
  onToggle: () => void;
  services: AppServices;
  link: ScaleLink;
}) {
  const near = clashes.filter(
    (clash) => clash.a.id === container.id || clash.b.id === container.id,
  );
  const flagged = near.some((clash) => !clash.dismissed);
  const severity = near.some((clash) => clash.kind === 'same') ? 'c-warn' : 'c-caution';
  const update = (
    changes: EntityChanges<'containers'> | ((current: Container) => EntityChanges<'containers'>),
  ) => services.entities.update('containers', container.id, changes);
  return (
    <div class="row setup-block" data-testid="container">
      <button type="button" class="setup-block-head" aria-expanded={open} onClick={onToggle}>
        <span class="setup-row-text" style={{ gap: '4px' }}>
          <span class="setup-row-start" style={{ fontWeight: 600 }}>
            {container.name}
            {near.length > 0 && <WarningIcon size={16} class={flagged ? severity : 'muted'} />}
          </span>
          <span class="badges">
            {container.roles.map((role) => (
              <span key={role} class="badge">
                {ROLE_LABEL[role]}
              </span>
            ))}
            {near.map((clash) => {
              const other = clash.a.id === container.id ? clash.b : clash.a;
              return (
                <span
                  key={other.id}
                  class={clash.dismissed ? 'muted' : clash.kind === 'same' ? 'c-warn' : 'c-caution'}
                  style={{ fontSize: '12px' }}
                >
                  {clash.kind === 'same'
                    ? `same as ${other.name}`
                    : `${tenths(clash.gapG)} g from ${other.name}`}
                </span>
              );
            })}
          </span>
        </span>
        <span class={flagged ? `num ${severity}` : 'num'} style={{ flex: '0 0 auto' }}>
          {tenths(container.emptyMassG)}
          <span class="unit" style={{ fontSize: '13px' }}>
            {' g'}
          </span>
        </span>
      </button>
      {open && (
        <div class="setup-block-body">
          <TextField
            id={`c-name-${container.id}`}
            label="Name"
            value={container.name}
            onCommit={(name) => {
              if (name !== '') update({ name });
            }}
          />
          <Roles
            roles={container.roles}
            onToggle={(role) => update((c) => ({ roles: toggledRole(c.roles, role) }))}
          />
          <div class="setup-actions">
            <WeighButton
              link={link}
              label="Weigh again"
              onWeigh={(emptyMassG) => update({ emptyMassG })}
            />
            <button
              type="button"
              class="btn2"
              onClick={() => update({ removedAtEpochMs: Date.now() })}
            >
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The roles, a multi-select. An old grind cup's role shows while it has it (D-101). */
function Roles({
  roles,
  onToggle,
}: {
  roles: readonly ContainerRole[];
  onToggle: (role: ContainerRole) => void;
}) {
  return (
    <div class="field">
      <span class="lbl">Role</span>
      <div role="group" aria-label="Role" class="role-grid">
        {CONTAINER_ROLES.filter((r) => OFFERED_ROLES.includes(r) || roles.includes(r)).map(
          (role) => {
            const on = roles.includes(role);
            return (
              <button
                key={role}
                type="button"
                class={on ? 'chip on' : 'chip'}
                aria-pressed={on}
                style={{ justifyContent: 'center' }}
                onClick={() => onToggle(role)}
              >
                {ROLE_LABEL[role]}
              </button>
            );
          },
        )}
      </div>
      <span class="muted setup-small">
        One container can have several roles. A scale accessory, like a mat, is part of the scale:
        what goes on it is weighed as usual.
      </span>
    </div>
  );
}

/**
 * A container's empty mass, as the scale weighs it now: the last thing put on, as the app saw it
 * (`link.vessel`), so the app's tares, a zero off the empty platform and a scale accessory under
 * it don't count (T2.17). That is the vessel's mass, or what went on top of it, as when a
 * container goes on a mat not learned yet. Else, for one put on before the scale was connected,
 * the still reading. Null while it moves.
 */
function useReading(link: ScaleLink): { readonly connected: boolean; readonly g: number | null } {
  useLiveUpdates(
    (notify) => {
      const offs = [
        link.transport.onStatus(notify),
        link.recorder.onChange(notify),
        link.connector.onChange(notify),
        link.vessel.onChange(notify),
      ];
      return () => offs.forEach((off) => off());
    },
    [link],
    150,
  );
  const connected = link.transport.status.state === 'connected';
  const display = connected ? link.shot.snapshot() : null;
  if (display === null || !display.stable) return { connected, g: null };
  const vessel = link.vessel.vessel;
  if (vessel === null) return { connected, g: display.readingG };
  const contentsG = link.vessel.onScale?.contentsG ?? 0;
  return { connected, g: contentsG >= MIN_CONTAINER_G ? contentsG : vessel.massG };
}

/** Takes the weight on the scale (`useReading`) as the container's empty mass, in tenths. */
function WeighButton({
  link,
  label,
  onWeigh,
  primary = false,
  disabled = false,
}: {
  link: ScaleLink;
  label: string;
  onWeigh: (massG: number) => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  const reading = useReading(link);
  const ok = reading.g !== null && reading.g >= MIN_CONTAINER_G;
  return (
    <button
      type="button"
      class={primary ? 'btn' : 'btn2'}
      disabled={disabled || !ok}
      onClick={() => {
        if (reading.g !== null) onWeigh(Math.round(reading.g * 10) / 10);
      }}
      data-testid={primary ? 'weigh-add' : 'weigh-again'}
    >
      {label}
    </button>
  );
}

function AddContainer({ services, link }: { services: AppServices; link: ScaleLink }) {
  const [name, setName] = useState('');
  const [roles, setRoles] = useState<readonly ContainerRole[]>(['cup']);
  const reading = useReading(link);
  const view = connectionView(link.transport.status, link.connector.state);
  return (
    <section class="card setup-form" aria-labelledby="c-add" data-testid="add-container">
      <div class="setup-line-flat">
        <h2 class="lbl" id="c-add" style={{ margin: 0 }}>
          Add container
        </h2>
        {reading.connected && (
          <span class="muted scale-reads">
            <span class={reading.g === null ? 'dot dot-off' : 'dot bg-balanced'} />
            Scale reads{' '}
            <span class="num" style={{ fontSize: '17px', color: 'var(--ink)' }} data-testid="reads">
              {reading.g === null ? '…' : tenths(reading.g)}
            </span>{' '}
            g
          </span>
        )}
      </div>
      {reading.connected ? (
        <span>Put the empty container on the scale.</span>
      ) : (
        <div class="connect-body-inline">
          <span class="muted">Connect the scale to weigh a container.</span>
          <ConnectBody view={view} state={link.connector.state} connector={link.connector} />
        </div>
      )}
      <div class="field">
        <label class="lbl" for="c-name">
          Name
        </label>
        <input
          class="input"
          id="c-name"
          type="text"
          value={name}
          onInput={(event) => setName(event.currentTarget.value)}
        />
      </div>
      <Roles roles={roles} onToggle={(role) => setRoles((now) => toggledRole(now, role))} />
      <WeighButton
        link={link}
        label="Weigh & add"
        primary
        disabled={name.trim() === '' || roles.length === 0}
        onWeigh={(emptyMassG) => {
          services.entities.add('containers', {
            name: name.trim(),
            emptyMassG,
            roles,
            dismissedWarningIds: [],
          });
          setName('');
        }}
      />
    </section>
  );
}
