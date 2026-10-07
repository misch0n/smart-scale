/**
 * The brew's phases, live (T2.5; spec v2 "Brew phases"): which phase is on screen, opened by the
 * container put on, the pump or a tap, and what each phase weighs as it pours. Display-only
 * (hard rule 3): the app logs each change (`PhaseChange`) in the recording, and the analysis
 * measures the phases from there (`measurePhases`).
 *
 * - **A known container opens its phase** by its roles: the milk jug the milk (for a milk drink),
 *   the cup the extraction (before its shot), the bean cup the beans, the grind cup the grind. A
 *   bean cup opens the beans until they are weighed; back empty after `grindMinMs` off the scale,
 *   its beans went into the grinder: they are done, with their weight, and the grind opens,
 *   whether or not it is a grind cup too (T2.14: session 3's bean cup, bean only, back empty, had
 *   the beans counted again from 0). Once the beans are done, only a tap opens them again: a tap
 *   on Beans with the cup on counts them again.
 * - **The bean cup back with its grounds:** a weight no container matches, which is a bean or
 *   grind cup plus about the beans (up to `retentionMaxG` less, `carriedExtraG` more), after
 *   `grindMinMs` off the scale, opens the grind with the grounds in it.
 * - **A lift is a pause:** nothing ends. The bean cup put back sooner, or with fewer beans, is the
 *   beans going on, counted from what it carried back. With the grind open, a bean or grind cup
 *   back carrying up to the beans is the grounds, whatever the retention (T2.22).
 * - **The grind tapped with a vessel on** (the bean cup, its beans in it: session 4), open or not,
 *   weighs only what goes into it from the tap: its beans aren't grounds. The grounds come when
 *   it is back from the grinder (T2.21).
 * - **The pump** opens the extraction; **a tap** opens any phase. During the shot (the pump on
 *   until "shot done") nothing put on changes the phase.
 * - **Opening a later phase** ends the earlier ones: done if they weighed something, else
 *   skipped. A phase opened again by a tap is open until a later one opens. The milk is done or
 *   skipped by a tap, or skipped when the shot is saved without it. The brew's ✕ ends the open
 *   phase the same way (`end`).
 *
 * The weights are the vessel's contents since it went on, plus what it carried back
 * (`PhaseVessel`): display figures, never stored.
 */

import {
  BREW_PHASES,
  isListed,
  MEASURED_PHASES,
  type BrewPhase,
  type Container,
  type MeasuredPhase,
  type PhaseCause,
  type PhaseChange,
} from '../model';

/** A vessel on the scale, as the phases see it (the app's `link.vessel`). */
export interface PhaseVessel {
  /** What it weighed as it went on, g. */
  readonly massG: number;
  /** What came on top since, g; null while it is being lifted. */
  readonly contentsG: number | null;
  /** The container it is, recognised or picked; null when unsure or unknown. */
  readonly container: Container | null;
}

export type PhaseStatus = 'pending' | 'open' | 'done' | 'skipped';

export interface PhaseRouterState {
  /** The phase on screen. */
  readonly current: BrewPhase;
  readonly status: Readonly<Record<BrewPhase, PhaseStatus>>;
  /** The recipe has a milk ratio, so there is a milk phase. */
  readonly milkOffered: boolean;
  /** The pump is on, until "shot done". */
  readonly pouring: boolean;
  /** The shot is done: the card is open. */
  readonly shotDone: boolean;
  /** What each phase weighed, as it shows, g; null before anything. */
  readonly beansG: number | null;
  readonly groundG: number | null;
  readonly milkG: number | null;
  /** The container the open phase weighs in: recognised, or the bean cup back with grounds. */
  readonly container: Container | null;
  /** A vessel is on the scale. */
  readonly vesselOn: boolean;
}

export interface PhaseRouterParams {
  /** Off the scale at least this long, the bean cup has been to the grinder, ms. */
  readonly grindMinMs: number;
  /** The grounds may weigh this much less than the beans: the grinder's retention, g. */
  readonly retentionMaxG: number;
  /** And this much more: old grounds the grinder let go, g. */
  readonly carriedExtraG: number;
  /** Less than this in a phase is nothing in it, g. */
  readonly minResultG: number;
}

export const DEFAULT_PHASE_PARAMS: PhaseRouterParams = {
  grindMinMs: 8000, // PROVISIONAL(U1.1: P3)
  retentionMaxG: 2, // PROVISIONAL(U1.1: P3)
  carriedExtraG: 1,
  minResultG: 0.3,
};

export interface PhaseRouterOptions {
  /** The phase to start on. Default the beans. */
  readonly start?: BrewPhase;
  readonly milkOffered?: boolean;
  /** The containers as they are now: for the bean cup back with its grounds. Default none. */
  readonly containers?: () => readonly Container[];
  readonly params?: Partial<PhaseRouterParams>;
}

type Loads = Record<MeasuredPhase, number | null>;

export class PhaseRouter {
  readonly #p: PhaseRouterParams;
  readonly #containers: () => readonly Container[];
  #current: BrewPhase;
  /** The phase last logged as open; null before the first. */
  #announced: BrewPhase | null = null;
  #milkOffered: boolean;
  /** Phases ended, and how. */
  readonly #closed = new Map<BrewPhase, 'done' | 'skipped'>();
  #pouring = false;
  #shotDone = false;
  #loads: Loads = { beans: null, grind: null, milk: null };
  /** What the vessel on carried in for the open phase, g. */
  #carried = 0;
  /**
   * What the vessel on held as Grind was tapped, which isn't grounds (T2.21): taken at the next
   * measure ('pending'), until the vessel comes off. Null when none.
   */
  #held: number | 'pending' | null = null;
  /** When the vessel on went on, ms: the same again is that vessel, its container now known. */
  #onMs: number | null = null;
  #container: Container | null = null;
  #vesselOn = false;
  /** When the last vessel came off, ms; null before any. */
  #offMs: number | null = null;

  constructor(options: PhaseRouterOptions = {}) {
    this.#p = { ...DEFAULT_PHASE_PARAMS, ...options.params };
    this.#containers = options.containers ?? (() => []);
    this.#current = options.start ?? 'beans';
    this.#milkOffered = options.milkOffered ?? false;
  }

  get state(): PhaseRouterState {
    const status = Object.fromEntries(
      BREW_PHASES.map((phase) => [phase, this.#status(phase)]),
    ) as Record<BrewPhase, PhaseStatus>;
    return {
      current: this.#current,
      status,
      milkOffered: this.#milkOffered,
      pouring: this.#pouring,
      shotDone: this.#shotDone,
      beansG: this.#loads.beans,
      groundG: this.#loads.grind,
      milkG: this.#loads.milk,
      container: this.#container,
      vesselOn: this.#vesselOn,
    };
  }

  /** Whether the recipe has a milk ratio. */
  setMilkOffered(offered: boolean): void {
    this.#milkOffered = offered;
  }

  /** A vessel went on (or its container became known, or was picked): opens its phase. */
  vesselOn(vessel: PhaseVessel, tMs: number): PhaseChange[] {
    const wasOn = this.#vesselOn;
    this.#vesselOn = true;
    if (!wasOn || tMs !== this.#onMs) this.#held = null;
    this.#onMs = tMs;
    if (this.#pouring) return [];
    const offForMs = wasOn || this.#offMs === null ? Infinity : tMs - this.#offMs;
    const container = vessel.container;
    const phase = container === null ? null : this.#phaseFor(container, offForMs);
    const changes =
      container === null
        ? this.#carriedBack(vessel, offForMs)
        : phase === null
          ? []
          : this.#openWith(phase, container, this.#carriedIn(phase, vessel, container));
    // The first vessel of the brew goes into the phase on screen, routed or not: it is measured.
    return this.#announced === null
      ? [...changes, ...this.#open(this.#current, 'container')]
      : changes;
  }

  /** The vessel came off: a pause. */
  vesselOff(tMs: number): void {
    this.#vesselOn = false;
    this.#offMs = tMs;
    this.#held = null;
  }

  /** What the vessel on holds now: the open phase's weight. */
  measure(vessel: PhaseVessel | null): void {
    if (vessel === null || vessel.contentsG === null || !this.#vesselOn || this.#pouring) return;
    const phase = this.#current;
    if (!isMeasured(phase)) return;
    if (this.#held === 'pending') this.#held = vessel.contentsG;
    const contentsG = Math.max(0, vessel.contentsG - (this.#held ?? 0));
    this.#loads = { ...this.#loads, [phase]: round(this.#carried + contentsG) };
  }

  /** The pump started (the Tare + start tap): the extraction. */
  pumpOn(): PhaseChange[] {
    this.#pouring = true;
    return this.#open('extraction', 'pump');
  }

  /** The tap that started no shot: the pump wasn't on after all. */
  pumpLapsed(): void {
    this.#pouring = false;
  }

  /** The shot is done. */
  shotDone(): PhaseChange[] {
    this.#pouring = false;
    if (this.#shotDone) return [];
    this.#shotDone = true;
    this.#closed.set('extraction', 'done');
    return [{ phase: 'extraction', state: 'done', by: 'shot' }];
  }

  /**
   * The user's tap on a phase. Another phase than the open one weighs what the vessel on holds
   * from now: what it carried in was for the phase it opened. The grind, even open already,
   * weighs only what goes into the vessel on from the tap (T2.21).
   */
  select(phase: BrewPhase): PhaseChange[] {
    if (phase === 'milk' && !this.#milkOffered) return [];
    if (phase !== this.#current && phase !== 'extraction') {
      this.#container = null;
      this.#carried = 0;
      this.#held = null;
    }
    // The beans in the cup on the scale aren't grounds (session 4): the grind weighs from here.
    if (phase === 'grind' && this.#vesselOn) this.#held = 'pending';
    return this.#open(phase, 'user');
  }

  /**
   * The brew ended by its ✕ (T2.15): the open phase ends, done if it weighed something, else
   * skipped, so the analysis measures it up to here and the next brew's phases start afresh. A
   * new brew has a new router.
   */
  end(): PhaseChange[] {
    const phase = this.#current;
    if (this.#announced === null || this.#closed.has(phase) || !isMeasured(phase)) return [];
    const how = (this.#loads[phase] ?? 0) >= this.#p.minResultG ? 'done' : 'skipped';
    this.#closed.set(phase, how);
    return [{ phase, state: how, by: 'user' }];
  }

  /** The milk is done (Done), or skipped (Skip milk, or the shot saved without it). */
  endMilk(how: 'done' | 'skipped'): PhaseChange[] {
    if (!this.#milkOffered || this.#closed.has('milk')) return [];
    this.#closed.set('milk', how);
    if (this.#current === 'milk') this.#current = 'extraction';
    return [{ phase: 'milk', state: how, by: 'user' }];
  }

  #status(phase: BrewPhase): PhaseStatus {
    if (phase === this.#current) return 'open';
    return this.#closed.get(phase) ?? 'pending';
  }

  /** The phase a known container opens, or null for none. */
  #phaseFor(container: Container, offForMs: number): BrewPhase | null {
    const { roles } = container;
    if (roles.includes('milk') && this.#milkOffered && !this.#closed.has('milk')) return 'milk';
    if (roles.includes('cup')) return this.#shotDone ? null : 'extraction';
    const bean = roles.includes('bean');
    const grind = roles.includes('grind');
    // The beans weighed, and the cup off long enough to have been to the grinder.
    const afterGrinder =
      (this.#loads.beans ?? 0) >= this.#p.minResultG && offForMs >= this.#p.grindMinMs;
    if ((grind && !bean) || (bean && afterGrinder)) {
      return this.#closed.get('grind') === 'done' && this.#current !== 'grind' ? null : 'grind';
    }
    // Weighed and done, the beans open again only by a tap: the cup put back while the grind is
    // open is the grind's.
    if (bean)
      return this.#closed.get('beans') === 'done' && this.#current !== 'beans' ? null : 'beans';
    return null;
  }

  /**
   * What a known container came on with: a few grams of beans or grounds within its match's 3 g
   * (`MATCH_ABOVE_G`). Not for the milk jug, which may only be wet.
   */
  #carriedIn(phase: BrewPhase, vessel: PhaseVessel, container: Container): number {
    if (phase !== 'beans' && phase !== 'grind') return 0;
    const carried = vessel.massG - container.emptyMassG;
    return carried >= this.#p.minResultG ? carried : 0;
  }

  /** A weight no container matches: the bean cup back with its grounds, or with beans. */
  #carriedBack(vessel: PhaseVessel, offForMs: number): PhaseChange[] {
    const beans = this.#loads.beans;
    const cups = this.#containers().filter(
      (c) => isListed(c) && (c.roles.includes('bean') || c.roles.includes('grind')),
    );
    const { retentionMaxG, carriedExtraG, minResultG, grindMinMs } = this.#p;
    const carried = (c: Container) => vessel.massG - c.emptyMassG;
    if (beans !== null && beans >= minResultG && offForMs >= grindMinMs) {
      const grind = cups.find((c) => {
        const g = carried(c);
        return g >= beans - retentionMaxG && g <= beans + carriedExtraG;
      });
      if (grind !== undefined) return this.#openWith('grind', grind, carried(grind));
    }
    if (this.#current === 'beans' || this.#current === 'grind') {
      const held = this.#loads[this.#current] ?? 0;
      // With the grind open, what the cup brings back is its grounds, whatever the grinder kept:
      // up to the beans, or anything when none were weighed (session 5, T2.22).
      const most =
        this.#current === 'grind'
          ? beans !== null && beans >= minResultG
            ? Math.max(held, beans)
            : Infinity
          : held;
      const upTo = most + carriedExtraG;
      const back = cups.find((c) => carried(c) >= minResultG && carried(c) <= upTo);
      if (back !== undefined) return this.#openWith(this.#current, back, carried(back));
    }
    this.#carried = 0;
    return [];
  }

  #openWith(phase: BrewPhase, container: Container, carriedG: number): PhaseChange[] {
    this.#container = container;
    this.#carried = carriedG;
    if (isMeasured(phase) && carriedG > 0) {
      this.#loads = { ...this.#loads, [phase]: round(carriedG) };
    }
    return this.#open(phase, 'container');
  }

  /** Opens `phase`, ending the earlier phases still pending or open. */
  #open(phase: BrewPhase, by: PhaseCause): PhaseChange[] {
    if (phase === this.#announced && phase === this.#current && !this.#closed.has(phase)) {
      return [];
    }
    const changes: PhaseChange[] = [];
    const order = BREW_PHASES.indexOf(phase);
    for (const earlier of BREW_PHASES.slice(0, order)) {
      if (earlier === 'extraction' || this.#closed.has(earlier)) continue;
      if (earlier === 'milk') continue;
      const weighed = (this.#loads[earlier as MeasuredPhase] ?? 0) >= this.#p.minResultG;
      const how = weighed ? 'done' : 'skipped';
      this.#closed.set(earlier, how);
      changes.push({ phase: earlier, state: how, by });
    }
    // Opened again by a tap: open until a later phase opens.
    if (phase !== 'extraction' || !this.#shotDone) this.#closed.delete(phase);
    this.#current = phase;
    this.#announced = phase;
    changes.push({ phase, state: 'open', by });
    return changes;
  }
}

function isMeasured(phase: BrewPhase): phase is MeasuredPhase {
  return (MEASURED_PHASES as readonly string[]).includes(phase);
}

function round(g: number): number {
  return Math.round(g * 10) / 10;
}
