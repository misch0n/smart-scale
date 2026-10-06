/**
 * Sound levels with every brew (T2.18; Q32, D-093): the microphone's levels (T1.24's
 * `SoundCapture`) go into the recordings of every brew, for the pump and grinder detector to
 * come (T3.1). The microphone opens only from a tap, once, before the shot, and stays open
 * (D-037: each opening holds the scale's notifications back for half a second). So the brew
 * screen hands its taps here: the Connect tap, or with a scale that connected by itself (T1.21)
 * the first tap of any other kind. Never the Start tap, made as the pump starts, nor ✕.
 *
 * Setup › Microphone's "Record sound with every brew" turns it off; it is on by default, and
 * kept on this device (`storage.local`, never exported: D-030). A microphone refused, or none
 * at all, isn't asked for again until the app reloads: the brew goes on without the levels.
 */

import type { LocalRepository } from '../storage';
import { Emitter, type Unsubscribe } from '../transport/emitter';
import type { SoundCapture } from './sound-capture';

/** Where the switch is kept: `false` when off; on when missing. */
export const BREW_SOUND_KEY = 'sound.withEveryBrew';

export class BrewSound {
  readonly #local: Pick<LocalRepository, 'get' | 'set'>;
  readonly #sound: Pick<SoundCapture, 'start' | 'stop' | 'state'>;
  readonly #changes = new Emitter<void>();
  #enabled: boolean;
  /** This switch turned the levels on: turning it off turns them off. */
  #startedHere = false;

  private constructor(
    local: Pick<LocalRepository, 'get' | 'set'>,
    sound: Pick<SoundCapture, 'start' | 'stop' | 'state'>,
    enabled: boolean,
  ) {
    this.#local = local;
    this.#sound = sound;
    this.#enabled = enabled;
  }

  /** Reads the switch; one that can't be read is on. */
  static async load(
    local: Pick<LocalRepository, 'get' | 'set'>,
    sound: Pick<SoundCapture, 'start' | 'stop' | 'state'>,
  ): Promise<BrewSound> {
    const stored = await local.get(BREW_SOUND_KEY).catch(() => undefined);
    return new BrewSound(local, sound, stored !== false);
  }

  /** Whether every brew records the sound levels. */
  get enabled(): boolean {
    return this.#enabled;
  }

  /**
   * Turns the switch on or off: at once, and stored behind it (a failure keeps it for this
   * session). Off, it turns off the levels it turned on.
   */
  setEnabled(enabled: boolean): Promise<void> {
    if (enabled === this.#enabled) return Promise.resolve();
    this.#enabled = enabled;
    if (!enabled && this.#startedHere && this.#sound.state.status !== 'off') this.#sound.stop();
    this.#startedHere = false;
    this.#changes.emit();
    return this.#local.set(BREW_SOUND_KEY, enabled).catch(() => {
      // Kept for this session: the switch is no record worth an error.
    });
  }

  /**
   * A tap on the brew screen, other than Start or ✕: turns the levels on when the switch is on
   * and they are off. Call it straight from the tap's handler, with nothing awaited before it
   * (`SoundCapture.start`).
   */
  tap(): void {
    if (!this.#enabled) return;
    const { status, lastStart } = this.#sound.state;
    if (status !== 'off' || lastStart === 'denied' || lastStart === 'unsupported') return;
    this.#startedHere = true;
    void this.#sound.start();
  }

  onChange(listener: () => void): Unsubscribe {
    return this.#changes.on(listener);
  }
}
