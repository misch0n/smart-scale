/**
 * The brew's phases, live (T2.5; spec v2 "Brew phases", as the user cut them in D-101): which
 * phase is on screen and what it weighs as it pours: the beans, the extraction, and the milk
 * after the shot. Display-only (hard rule 3): the app logs each change (`PhaseChange`) in the
 * recording, and the analysis measures the phases from there (`measurePhases`).
 *
 * - **No grind phase** (D-101): the grinder and its setting go with the beans, and nothing
 *   weighs the grounds. The model keeps `grind` for the recordings made before; it is never
 *   opened, closed or logged here.
 * - **A known container opens its phase** by its roles: the bean cup (or an old grind cup) the
 *   beans, the cup the extraction (before its shot), the milk jug the milk (for a milk drink,
 *   once the shot is done). Once the beans are done, only a tap opens them again.
 * - **A lift is a pause:** nothing ends. The bean cup put back with what it held is the beans
 *   going on, counted from what it carried back; put back empty (the beans went into the
 *   grinder), their weight stands until more go in.
 * - **The pump** opens the extraction; **a tap** opens any phase. During the shot (the pump on
 *   until "shot done") nothing put on changes the phase.
 * - **Opening a later phase** ends the earlier ones: done if they weighed something, else
 *   skipped. The milk is done or skipped by a tap, or skipped when the shot is saved without
 *   it. The brew's ✕ ends the open phase the same way (`end`).
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
  readonly milkG: number | null;
  /** The container the open phase weighs in: recognised, or the bean cup put back. */
  readonly container: Container | null;
  /** A vessel is on the scale. */
  readonly vesselOn: boolean;
}

export interface PhaseRouterParams {
  /** And this much more than it held: beans clinging, g. */
  readonly carriedExtraG: number;
  /** Less than this in a phase is nothing in it, g. */
  readonly minResultG: number;
  /** A bean cup carries at most this much with no beans weighed: a dose, g. */
  readonly doseMaxG: number;
}

export const DEFAULT_PHASE_PARAMS: PhaseRouterParams = {
  carriedExtraG: 1,
  minResultG: 0.3,
  doseMaxG: 30,
};

export interface PhaseRouterOptions {
  /** The phase to start on. Default the beans. */
  readonly start?: BrewPhase;
  readonly milkOffered?: boolean;
  /** The containers as they are now: for the bean cup put back with its beans. Default none. */
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
  #container: Container | null = null;
  #vesselOn = false;
  /** The beans' cup came back empty (to the grinder and back): their weight stands until more go in. */
  #keepLast = false;

  constructor(options: PhaseRouterOptions = {}) {
    this.#p = { ...DEFAULT_PHASE_PARAMS, ...options.params };
    this.#containers = options.containers ?? (() => []);
    this.#current = options.start === 'grind' ? 'beans' : (options.start ?? 'beans');
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
  vesselOn(vessel: PhaseVessel): PhaseChange[] {
    this.#vesselOn = true;
    if (this.#pouring) return [];
    const container = vessel.container;
    const phase = container === null ? null : this.#phaseFor(container);
    const changes =
      container === null
        ? this.#carriedBack(vessel)
        : phase === null
          ? []
          : this.#openWith(phase, container, this.#carriedIn(phase, vessel, container));
    // Back empty, the beans weighed stand (D-101): what goes in next counts again.
    this.#keepLast =
      this.#current === 'beans' &&
      this.#carried < this.#p.minResultG &&
      (this.#loads.beans ?? 0) >= this.#p.minResultG;
    // The first vessel of the brew goes into the phase on screen, routed or not: it is measured.
    return this.#announced === null
      ? [...changes, ...this.#open(this.#current, 'container')]
      : changes;
  }

  /** The vessel came off: a pause. */
  vesselOff(): PhaseChange[] {
    this.#vesselOn = false;
    return [];
  }

  /**
   * Whether `vessel`, put on in the beans, is a bean cup carrying beans: from the least a phase
   * holds up to the beans (or a dose, none weighed) and the grams that cling. Such a cup is never
   * tared: the scale shows what it carries (T2.23, D-099).
   */
  carries(vessel: PhaseVessel): boolean {
    if (this.#current !== 'beans' || vessel.container !== null) return false;
    const { minResultG, carriedExtraG, doseMaxG } = this.#p;
    const beans = this.#loads.beans ?? 0;
    const most = (beans >= minResultG ? beans : doseMaxG) + carriedExtraG;
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
    const loadG = round(this.#carried + vessel.contentsG);
    if (this.#keepLast && phase === 'beans') {
      if (loadG < this.#p.minResultG) return;
      this.#keepLast = false;
    }
    this.#loads = { ...this.#loads, [phase]: loadG };
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
   * from now: what it carried in was for the phase it opened. No grind (D-101).
   */
  select(phase: BrewPhase): PhaseChange[] {
    if (phase === 'grind' || (phase === 'milk' && !this.#milkOffered)) return [];
    if (phase !== this.#current && phase !== 'extraction') {
      this.#container = null;
      this.#carried = 0;
    }
    this.#keepLast = false;
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
  #phaseFor(container: Container): BrewPhase | null {
    const { roles } = container;
    if (roles.includes('milk') && this.#milkOffered && !this.#closed.has('milk')) return 'milk';
    if (roles.includes('cup')) return this.#shotDone ? null : 'extraction';
    // Weighed and done, the beans open again only by a tap.
    if (roles.includes('bean') || roles.includes('grind')) {
      return this.#closed.get('beans') === 'done' && this.#current !== 'beans' ? null : 'beans';
    }
    return null;
  }

  /**
   * What a known container came on with: a few grams of beans within its match's 3 g
   * (`MATCH_ABOVE_G`). Not for the milk jug, which may only be wet.
   */
  #carriedIn(phase: BrewPhase, vessel: PhaseVessel, container: Container): number {
    if (phase !== 'beans') return 0;
    const carried = vessel.massG - container.emptyMassG;
    return carried >= this.#p.minResultG ? carried : 0;
  }

  /** A weight no container matches: the bean cup put back with its beans. */
  #carriedBack(vessel: PhaseVessel): PhaseChange[] {
    if (this.#current === 'beans') {
      const upTo = (this.#loads.beans ?? 0) + this.#p.carriedExtraG;
      const back = this.#cups().find((c) => {
        const carried = vessel.massG - c.emptyMassG;
        return carried >= this.#p.minResultG && carried <= upTo;
      });
      if (back !== undefined) return this.#openWith('beans', back, vessel.massG - back.emptyMassG);
    }
    this.#carried = 0;
    return [];
  }

  /** The bean cups listed (an old grind cup is one too). */
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

  /** Opens `phase`, ending the earlier phases still pending or open (never the grind). */
  #open(phase: BrewPhase, by: PhaseCause): PhaseChange[] {
    if (phase === this.#announced && phase === this.#current && !this.#closed.has(phase)) {
      return [];
    }
    const changes: PhaseChange[] = [];
    const order = BREW_PHASES.indexOf(phase);
    for (const earlier of BREW_PHASES.slice(0, order)) {
      if (earlier !== 'beans' || this.#closed.has(earlier)) continue;
      const weighed = (this.#loads.beans ?? 0) >= this.#p.minResultG;
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
