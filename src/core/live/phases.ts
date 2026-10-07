/**
 * The brew's phases, live (T2.5; spec v2 "Brew phases"): which phase is on screen, opened by the
 * container put on, the pump or a tap, and what each phase weighs as it pours. Display-only
 * (hard rule 3): the app logs each change (`PhaseChange`) in the recording, and the analysis
 * measures the phases from there (`measurePhases`).
 *
 * - **A known container opens its phase** by its roles: the milk jug the milk (for a milk drink),
 *   the cup the extraction (before its shot; with the grind open, the grind ends with its last
 *   weight), the bean cup the beans, the grind cup the grind. Once the beans are done, only a
 *   tap opens them again: a tap on Beans with the cup on counts them again.
 * - **The beans' cup lifted with the beans in it** ends the beans and opens the grind, with no
 *   tap (T2.24, D-100): the cup the beans were weighed in is the grind's.
 * - **With the grind open, whatever that cup brings back is the grounds:** its weight less what
 *   it weighed empty, however long it was off and whatever the grinder kept, up to a dose
 *   (`doseMaxG`). Each time it comes back is the grind's last weight; back empty (the grounds
 *   tipped out), the last weight stands. With no beans weighed (the grind tapped), a bean or
 *   grind cup back with up to a dose is the same.
 * - **A lift is a pause** otherwise: the bean cup put back while the beans are open, with what it
 *   held, is the beans going on, counted from what it carried back.
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
  /** And this much more: old grounds the grinder let go, g. */
  readonly carriedExtraG: number;
  /** Less than this in a phase is nothing in it, g. */
  readonly minResultG: number;
  /**
   * A cup lifted off with what Grind's tap held back reads up to this much more as the hand
   * lifts it: no grounds, g (session 6).
   */
  readonly liftNoiseG: number;
  /** A bean or grind cup carries at most this much with no beans weighed: a dose, g. */
  readonly doseMaxG: number;
}

/** A cup back weighing this much less than it did empty is still it, g. */
const SAME_CUP_G = 0.5;

export const DEFAULT_PHASE_PARAMS: PhaseRouterParams = {
  grindMinMs: 8000, // PROVISIONAL(U1.1: P3)
  carriedExtraG: 1,
  minResultG: 0.3,
  liftNoiseG: 2, // PROVISIONAL(U1.1: P20)
  doseMaxG: 30,
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
  /**
   * The cup the beans were weighed in, and what it weighs empty: the grind's from the beans' lift
   * on (T2.24, D-100). Null before the beans weighed anything.
   */
  #beansCup: { readonly emptyG: number; readonly container: Container | null } | null = null;
  /** The grind's cup came back empty: its last weight stands until something goes in. */
  #keepLast = false;
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
    if (this.#isGrindCup(vessel)) return this.#grindCupBack(vessel);
    const phase = container === null ? null : this.#phaseFor(container, offForMs);
    const changes =
      container === null
        ? this.#carriedBack(vessel)
        : phase === null
          ? []
          : this.#openWith(phase, container, this.#carriedIn(phase, vessel, container));
    // The first vessel of the brew goes into the phase on screen, routed or not: it is measured.
    return this.#announced === null
      ? [...changes, ...this.#open(this.#current, 'container')]
      : changes;
  }

  /**
   * The vessel came off: a pause, but for the beans' cup lifted with the beans in it, which ends
   * the beans and opens the grind (T2.24, D-100).
   */
  vesselOff(tMs: number): PhaseChange[] {
    this.#vesselOn = false;
    this.#offMs = tMs;
    // Off with the beans Grind's tap held back: what the lift's hand added is no grounds.
    const grindG = this.#loads.grind;
    if (this.#held !== null && this.#current === 'grind' && grindG !== null) {
      if (grindG < this.#p.liftNoiseG) this.#loads = { ...this.#loads, grind: 0 };
    }
    this.#held = null;
    const beansG = this.#loads.beans ?? 0;
    if (this.#current !== 'beans' || this.#pouring || this.#beansCup === null) return [];
    if (beansG < this.#p.minResultG) return [];
    this.#container = this.#beansCup.container;
    this.#carried = 0;
    this.#keepLast = false;
    return this.#open('grind', 'container');
  }

  /**
   * Whether `vessel`, put on in the beans or the grind, is a bean or grind cup carrying beans or
   * grounds: from the least a phase holds up to the beans (or a dose, none weighed) and the grams
   * that cling. Such a cup is never tared: the scale shows what it carries (T2.23, D-099).
   */
  carries(vessel: PhaseVessel): boolean {
    if (this.#current !== 'beans' && this.#current !== 'grind') return false;
    if (this.#isGrindCup(vessel)) {
      return vessel.massG - this.#beansCup!.emptyG >= this.#p.minResultG;
    }
    if (vessel.container !== null) return false;
    const { minResultG, carriedExtraG, doseMaxG } = this.#p;
    const weighed = Math.max(this.#loads.beans ?? 0, this.#loads.grind ?? 0);
    const most = (weighed >= minResultG ? weighed : doseMaxG) + carriedExtraG;
    return this.#cups().some((c) => {
      const carried = vessel.massG - c.emptyMassG;
      return carried >= minResultG && carried <= most;
    });
  }

  /** What the vessel on holds now: the open phase's weight. */
  measure(vessel: PhaseVessel | null): void {
    if (vessel === null || vessel.contentsG === null || !this.#vesselOn || this.#pouring) return;
    const phase = this.#current;
    if (!isMeasured(phase)) return;
    if (this.#held === 'pending') this.#held = vessel.contentsG;
    const contentsG = Math.max(0, vessel.contentsG - (this.#held ?? 0));
    const loadG = round(this.#carried + contentsG);
    if (this.#keepLast && phase === 'grind') {
      if (loadG < this.#p.minResultG) return;
      this.#keepLast = false;
    }
    this.#loads = { ...this.#loads, [phase]: loadG };
    // The cup the beans are weighed in: the grind's after their lift.
    if (phase === 'beans' && loadG >= this.#p.minResultG) {
      const container = this.#container;
      const emptyG = container?.emptyMassG ?? vessel.massG - this.#carried;
      this.#beansCup = { emptyG, container };
    }
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
  #carriedBack(vessel: PhaseVessel): PhaseChange[] {
    const cups = this.#cups();
    const { carriedExtraG, minResultG, doseMaxG } = this.#p;
    const carried = (c: Container) => vessel.massG - c.emptyMassG;
    if (this.#current === 'beans' || this.#current === 'grind') {
      // The bean cup put back while the beans are open, with what it held: the beans going on.
      // The grind open with no beans weighed (tapped): what a bean or grind cup brings back, up
      // to a dose.
      const held = this.#loads[this.#current] ?? 0;
      const upTo = (this.#current === 'grind' ? doseMaxG : held) + carriedExtraG;
      const back = cups.find((c) => carried(c) >= minResultG && carried(c) <= upTo);
      if (back !== undefined) return this.#openWith(this.#current, back, carried(back));
    }
    this.#carried = 0;
    return [];
  }

  /**
   * Whether `vessel`, with the grind open, is the cup the beans were weighed in: no lighter than
   * it was empty, and with up to a dose (and the grams that cling) in it, unless it is a known
   * container of another phase.
   */
  #isGrindCup(vessel: PhaseVessel): boolean {
    const cup = this.#beansCup;
    if (this.#current !== 'grind' || cup === null) return false;
    const roles = vessel.container?.roles;
    if (roles !== undefined && !roles.includes('bean') && !roles.includes('grind')) return false;
    const carried = vessel.massG - cup.emptyG;
    return carried >= -SAME_CUP_G && carried <= this.#p.doseMaxG + this.#p.carriedExtraG;
  }

  /**
   * The beans' cup back with the grind open: what it carries is the grounds, whatever the
   * grinder kept and however long it was off (T2.24, D-100). Back empty, the grind keeps its
   * last weight until something goes in.
   */
  #grindCupBack(vessel: PhaseVessel): PhaseChange[] {
    const cup = this.#beansCup!;
    const carried = vessel.massG - cup.emptyG;
    this.#container = cup.container;
    if (carried >= this.#p.minResultG) {
      this.#carried = carried;
      this.#keepLast = false;
      this.#loads = { ...this.#loads, grind: round(carried) };
    } else {
      this.#carried = 0;
      this.#keepLast = (this.#loads.grind ?? 0) >= this.#p.minResultG;
    }
    return [];
  }

  /** The bean and grind cups listed. */
  #cups(): Container[] {
    return this.#containers().filter(
      (c) => isListed(c) && (c.roles.includes('bean') || c.roles.includes('grind')),
    );
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
