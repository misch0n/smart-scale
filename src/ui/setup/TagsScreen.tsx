// The tags (T2.9; board Setup-Tags; spec v2 "Tags"): one list, each with how many shots carry it,
// and a switch for whether it is on for every new shot. A tag's name opens its rename and remove;
// a renamed tag keeps its old name on the shots that have it, which history never rewrites
// (D-068). New tags are added at the end, off by default, as on the shot card.

import { useEffect, useState } from 'preact/hooks';
import { sameTag, tagName } from '../../app/brew-settings';
import type { AppServices } from '../../app/startup';
import type { Tag } from '../../core/model';
import { setupHash, type Route } from '../route';
import { shotCount, tagShotCounts, tagsSummary } from './format';
import { SetupPage, useDraft, useSetupUpdates } from './parts';

export function TagsScreen({ services, route }: { services: AppServices; route: Route }) {
  useSetupUpdates(services);
  const { entities, brew } = services;
  const tags = entities.listed('tags');
  const [counts, setCounts] = useState<ReadonlyMap<string, number> | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [text, setText] = useState('');

  useEffect(() => {
    let cancelled = false;
    services.storage.shots.list().then(
      (shots) => {
        if (!cancelled) {
          setCounts(tagShotCounts(shots.filter((shot) => shot.discardedAtEpochMs === null)));
        }
      },
      () => {
        // The counts are a nicety: without them the rows show none.
      },
    );
    return () => {
      cancelled = true;
    };
  }, [services]);

  const add = (): void => {
    if (brew.preferences.addTag(text) !== null) setText('');
  };

  return (
    <SetupPage
      title="Tags"
      back={{ href: setupHash({ section: 'list' }, route.mock), label: 'Setup' }}
      action={<span class="muted">{tagsSummary(entities.value.tags, true)}</span>}
      mock={route.mock}
      services={services}
      testId="setup-tags-screen"
    >
      <p class="muted setup-note">
        Default tags are on for every new shot. Tag experiments so you can filter them later.
      </p>
      <section class="setup-section" aria-label="Tags">
        <div class="tags-head">
          <span class="lbl" aria-hidden="true">
            Default
          </span>
        </div>
        <div class="card">
          {tags.map((tag) => (
            <TagRow
              key={tag.id}
              tag={tag}
              shots={counts?.get(tag.name.toLocaleLowerCase()) ?? null}
              open={open === tag.id}
              onToggle={() => setOpen(open === tag.id ? null : tag.id)}
              onDefault={() =>
                entities.update('tags', tag.id, (current) => ({ isDefault: !current.isDefault }))
              }
              onRename={(name) => {
                const kept = tagName(name);
                if (kept === '' || tags.some((t) => t.id !== tag.id && sameTag(t.name, kept)))
                  return;
                entities.update('tags', tag.id, { name: kept });
              }}
              onRemove={() => {
                setOpen(null);
                entities.update('tags', tag.id, { removedAtEpochMs: Date.now() });
              }}
            />
          ))}
          {tags.length === 0 && <p class="muted setup-pad">No tags.</p>}
        </div>
      </section>

      <section class="setup-section">
        <label class="lbl setup-label" for="t-new">
          New tag
        </label>
        <div class="card setup-inline-form">
          <input
            class="input"
            id="t-new"
            type="text"
            placeholder="Tag name"
            value={text}
            onInput={(event) => setText(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') add();
            }}
          />
          <button
            type="button"
            class="btn2"
            onClick={add}
            disabled={tagName(text) === ''}
            data-testid="add-tag"
          >
            Add
          </button>
        </div>
      </section>
    </SetupPage>
  );
}

function TagRow({
  tag,
  shots,
  open,
  onToggle,
  onDefault,
  onRename,
  onRemove,
}: {
  tag: Tag;
  shots: number | null;
  open: boolean;
  onToggle: () => void;
  /** Switches whether it is on for new shots. */
  onDefault: () => void;
  onRename: (name: string) => void;
  onRemove: () => void;
}) {
  const [name, setName] = useDraft(tag.name);
  return (
    <div class="row setup-block" data-testid="tag">
      <div class="setup-line-flat tag-line">
        <button type="button" class="tag-name" aria-expanded={open} onClick={onToggle}>
          <span style={{ fontWeight: 600 }}>{tag.name}</span>
          {shots !== null && <span class="muted setup-small">{shotCount(shots)}</span>}
        </button>
        <button
          type="button"
          class={tag.isDefault ? 'toggle on' : 'toggle'}
          aria-pressed={tag.isDefault}
          aria-label={`Default for new shots: ${tag.name}`}
          onClick={onDefault}
          data-testid="tag-default"
        />
      </div>
      {open && (
        <div class="setup-block-body">
          <div class="field">
            <label class="lbl" for={`t-name-${tag.id}`}>
              Name
            </label>
            <input
              class="input"
              id={`t-name-${tag.id}`}
              type="text"
              value={name}
              onInput={(event) => setName(event.currentTarget.value)}
              onChange={(event) => onRename(event.currentTarget.value)}
            />
          </div>
          <span class="muted setup-small">Shots tagged before keep the name they had.</span>
          <div class="setup-actions">
            <button type="button" class="btn2" onClick={onRemove}>
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
