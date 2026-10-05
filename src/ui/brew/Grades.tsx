// The grades (spec v2 "Grading", D-054): the taste, channelling and the tags, as the shot card
// (board Brew-Finish) and the shot detail (board History-Detail) show them. The card has its
// heading above the card and an Add chip; the detail has its heading inside, says that changes
// are saved, and adds no tags.

import { useState } from 'preact/hooks';
import { sameTag, type BrewTag } from '../../app/brew-settings';
import { DIRECTIONS, type Direction, type Shot } from '../../core/model';
import { PlusIcon } from '../icons';
import './grades.css';

export const TASTE_LABELS: Readonly<Record<Direction, string>> = {
  sour: 'Sour',
  balanced: 'Balanced',
  bitter: 'Bitter',
};

/** What the grades change: the brew flow's open card, or a stored shot's editor. */
export interface GradeActions {
  setTaste(direction: Direction | null): unknown;
  setChannelled(channelled: boolean): unknown;
  toggleTag(name: string): unknown;
}

export interface GradesProps {
  readonly shot: Shot;
  readonly actions: GradeActions;
  /** The tag list (`BrewPreferences`): its tags, then any of the shot's it lacks. */
  readonly tags: readonly BrewTag[];
  readonly variant: 'card' | 'detail';
  /** Adds a tag to the list and to the shot; the card's Add chip. */
  readonly onAddTag?: (text: string) => void;
}

export function Grades({ shot, actions, tags: list, variant, onAddTag }: GradesProps) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const tags = shot.tags ?? [];
  const names = [
    ...list.map((tag) => tag.name),
    ...tags.filter((tag) => !list.some((t) => sameTag(t.name, tag))),
  ];
  const channelled = shot.channelled === true;
  const detail = variant === 'detail';
  const id = (name: string) => `${detail ? 'd' : 'f'}-${name}`;
  const label = (name: string, text: string) => (
    <span class={detail ? 'grade-name' : 'lbl'} id={id(name)}>
      {text}
    </span>
  );

  const body = (
    <>
      <div class="grade">
        {label('taste', 'Taste')}
        <div role="group" aria-labelledby={id('taste')} class="tastes">
          {DIRECTIONS.map((direction) => {
            const on = shot.direction === direction;
            return (
              <button
                key={direction}
                type="button"
                class={`dirbtn d-${direction}${on ? ' on' : ''}`}
                aria-pressed={on}
                onClick={() => actions.setTaste(on ? null : direction)}
              >
                <span class={`dot bg-${direction}`} />
                {TASTE_LABELS[direction]}
              </button>
            );
          })}
        </div>
      </div>
      <div class="grade-switch">
        <span>
          <span>Channelling</span>
          <span class="muted">
            {detail ? 'Channels or spurts in the puck' : 'Channels or spurts'}
          </span>
        </span>
        <button
          type="button"
          class={channelled ? 'toggle on' : 'toggle'}
          aria-pressed={channelled}
          aria-label="Channelling"
          onClick={() => actions.setChannelled(!channelled)}
        />
      </div>
      <div class="grade">
        {label('tags', 'Tags')}
        <div role="group" aria-labelledby={id('tags')} class="tags">
          {names.map((name) => {
            const on = tags.some((tag) => sameTag(tag, name));
            return (
              <button
                key={name}
                type="button"
                class={on ? 'chip on' : 'chip'}
                aria-pressed={on}
                onClick={() => actions.toggleTag(name)}
              >
                {name}
              </button>
            );
          })}
          {onAddTag !== undefined &&
            (adding ? (
              <form
                class="tag-add"
                onSubmit={(event) => {
                  event.preventDefault();
                  onAddTag(text);
                  setText('');
                  setAdding(false);
                }}
              >
                <input
                  class="input"
                  type="text"
                  value={text}
                  placeholder="New tag"
                  aria-label="New tag"
                  maxLength={40}
                  autoFocus
                  onInput={(event) => setText(event.currentTarget.value)}
                />
                <button type="submit" class="btn2" disabled={text.trim() === ''}>
                  Add
                </button>
              </form>
            ) : (
              <button type="button" class="chip add" onClick={() => setAdding(true)}>
                <PlusIcon size={14} />
                Add
              </button>
            ))}
        </div>
      </div>
    </>
  );

  if (detail) {
    return (
      <section class="card grades grades-detail" aria-labelledby={id('grades')}>
        <div class="grades-head">
          <h2 class="lbl" id={id('grades')}>
            Grades
          </h2>
          <span class="muted">Saved as you change them</span>
        </div>
        {body}
      </section>
    );
  }
  return (
    <section class="section" aria-labelledby={id('grades')}>
      <h2 class="lbl" id={id('grades')}>
        Grades
      </h2>
      <div class="card grades">{body}</div>
    </section>
  );
}
