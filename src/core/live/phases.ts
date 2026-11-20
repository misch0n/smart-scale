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
 * - **The beans' last weight** (T3.25, D-117): lifted, the bean cup leaves the weight that held
 *   still for `settledMs`, when its last reading lies within `pressMaxG` of it: a hand pressing on
 *   the cup as it lifts it isn't beans.
 * - **A lift is a pause:** nothing ends. The bean cup put back with what it held is the beans
 *   going on, counted from what it carried back; put back empty (the beans went into the
 *   grinder), their weight stands until more go in.
 * - **The pump** opens the extraction; **a tap** opens any phase. During the shot (the pump on
 *   until "shot done") nothing put on changes the phase.
 * - **After a tap on the beans or the extraction** (T3.24, D-116), the first vessel heavier than
 *   the dose is that phase's, known or not: a container the app doesn't know becomes the phase's
 *   (`adopted`), the scale is tared for it, and the beans count from 0 in it. One on the scale as
 *   the tap is made counts too. A known container still opens its own phase.
 * - **Opening a later phase** ends the earlier ones: done if they weighed something, else
 *   skipped. The milk is done when the jug is lifted with milk in it (an empty jug lifted and
 *   put back goes on, T2.26); skipped by a tap, or when the shot is saved without it. The brew's
 *   ✕ ends the open phase the same way (`end`).
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
  /**
   * The vessel on is an unknown one taken as the open phase's container after a tap (T3.24):
   * tared, and never a bean cup carrying beans.
   */
  readonly adopted: boolean;
}

export interface PhaseRouterParams {
  /** And this much more than it held: beans clinging, g. */
  readonly carriedExtraG: number;
  /** Less than this in a phase is nothing in it, g. */
  readonly minResultG: number;
  /** A bean cup carries at most this much with no beans weighed: a dose, g. */
  readonly doseMaxG: number;
  /** The jug lifted with at least this much in it ends the milk; less is a lift, g. */
  readonly milkFilledG: number;
  /** The beans' weight held still this long is settled, ms (T3.25). */
  readonly settledMs: number;
  /** At a lift, a last weight within this of the settled one is a press, g (T3.25). */
  readonly pressMaxG: number;
}

export const DEFAULT_PHASE_PARAMS: PhaseRouterParams = {
  carriedExtraG: 1,
  minResultG: 0.3,
  doseMaxG: 30,
  milkFilledG: 10,
  settledMs: 2000, // PROVISIONAL(U1.1: the beans' lift, P38)
  pressMaxG: 0.5,
};

export interface PhaseRouterOptions {
  /** The phase to start on. Default the beans. */
  readonly start?: BrewPhase;
  readonly milkOffered?: boolean;
  /** The containers as they are now: for the bean cup put back with its beans. Default none. */
  readonly containers?: () => readonly Container[];
  readonly params?: Partial<PhaseRouterParams>;
  /** The dose, g (`setDoseG`). Default 18. */
  readonly doseG?: number;
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
  /** The most the jug has held in the milk, g: filled, its lift ends the milk (a tare by hand too). */
  #milkMostG = 0;
  /** A tap opened this phase: the first vessel heavier than the dose is its own (T3.24). */
  #adopting: 'beans' | 'extraction' | null = null;
  /** The vessel on was taken for the open phase's container after a tap (T3.24). */
  #adopted = false;
  /** The dose, g: a vessel heavier is a container, not a pour of beans (T3.24). */
  #doseG: number;
  /** The beans' weight holding still, and since when (T3.25); null while it moves. */
  #holding: { g: number; sinceMs: number } | null = null;
  /** The beans' last weight that held still for `settledMs` (T3.25). */
  #settledBeansG: number | null = null;

  constructor(options: PhaseRouterOptions = {}) {
    this.#p = { ...DEFAULT_PHASE_PARAMS, ...options.params };
    this.#containers = options.containers ?? (() => []);
    this.#current = options.start === 'grind' ? 'beans' : (options.start ?? 'beans');
    this.#milkOffered = options.milkOffered ?? false;
    this.#doseG = options.doseG ?? 18;
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
      adopted: this.#adopted,
    };
  }

  /** Whether the recipe has a milk ratio. */
  setMilkOffered(offered: boolean): void {
    this.#milkOffered = offered;
  }

  /** The brew's dose, g: what a vessel must weigh more than to be a phase's container (T3.24). */
  setDoseG(doseG: number): void {
    this.#doseG = doseG;
  }

  /** A vessel went on (or its container became known, or was picked): opens its phase. */
  vesselOn(vessel: PhaseVessel): PhaseChange[] {
    this.#vesselOn = true;
    this.#adopted = false;
    if (this.#pouring) return [];
    if (this.#adopting !== null && vessel.massG > this.#doseG) {
      // The first vessel heavier than the dose since the tap: a known one opens its own phase,
      // an unknown one is the open phase's (T3.24).
      this.#adopting = null;
      if (vessel.container === null) return this.#adopt();
    }
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

  /**
   * The vessel came off: a pause, but for the jug lifted with its milk, which ends the milk
   * (D-101, T2.26). Lifted empty, it goes on when it is put back.
   */
  vesselOff(): PhaseChange[] {
    this.#vesselOn = false;
    this.#adopted = false;
    // Lifted: a press on the cup as it went isn't beans; the weight that held still is (T3.25).
    const beans = this.#loads.beans;
    const settled = this.#settledBeansG;
    if (
      this.#current === 'beans' &&
      beans !== null &&
      settled !== null &&
      Math.abs(beans - settled) <= this.#p.pressMaxG
    ) {
      this.#loads = { ...this.#loads, beans: settled };
    }
    this.#holding = null;
    this.#settledBeansG = null;
    if (this.#current !== 'milk' || this.#closed.has('milk')) return [];
    if (this.#milkMostG < this.#p.milkFilledG) return [];
    this.#closed.set('milk', 'done');
    this.#current = 'extraction';
    return [{ phase: 'milk', state: 'done', by: 'container' }];
  }

  /**
   * Whether `vessel`, put on in the beans, is a bean cup carrying beans: from the least a phase
   * holds up to the beans (or a dose, none weighed) and the grams that cling. Such a cup is never
   * tared: the scale shows what it carries (T2.23, D-099).
   */
  carries(vessel: PhaseVessel): boolean {
    if (this.#current !== 'beans' || vessel.container !== null || this.#adopted) return false;
    const { minResultG, carriedExtraG, doseMaxG } = this.#p;
    const beans = this.#loads.beans ?? 0;
    const most = (beans >= minResultG ? beans : doseMaxG) + carriedExtraG;
    return this.#cups().some((c) => {
      const carried = vessel.massG - c.emptyMassG;
      return carried >= minResultG && carried <= most;
    });
  }

  /**
   * What the vessel on holds now: the open phase's weight. `reading`: whether the scale's readings
   * hold still, and the latest one's time, ms, for the beans' settled weight (T3.25).
   */
  measure(
    vessel: PhaseVessel | null,
    reading: { readonly stable: boolean; readonly tMs: number } | null = null,
  ): void {
    if (vessel === null || vessel.contentsG === null || !this.#vesselOn || this.#pouring) return;
    const phase = this.#current;
    if (!isMeasured(phase)) return;
    const loadG = round(this.#carried + vessel.contentsG);
    if (this.#keepLast && phase === 'beans') {
      if (loadG < this.#p.minResultG) return;
      this.#keepLast = false;
    }
    if (phase === 'beans') this.#hold(loadG, reading);
    this.#loads = { ...this.#loads, [phase]: loadG };
    if (phase === 'milk') this.#milkMostG = Math.max(this.#milkMostG, loadG);
  }

  /** The beans' weight as it holds still, or not (T3.25). */
  #hold(loadG: number, reading: { readonly stable: boolean; readonly tMs: number } | null): void {
    if (reading === null || !reading.stable) {
      this.#holding = null;
      return;
    }
    const holding = this.#holding;
    if (holding === null || Math.abs(holding.g - loadG) > 0.05) {
      this.#holding = { g: loadG, sinceMs: reading.tMs };
    } else if (reading.tMs - holding.sinceMs >= this.#p.settledMs) {
      this.#settledBeansG = holding.g;
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
   * from now: what it carried in was for the phase it opened. No grind (D-101). After a tap on the
   * beans or the extraction, the first vessel heavier than the dose is that phase's (T3.24):
   * `onScale`, the vessel on as the tap is made, if it is one.
   */
  select(phase: BrewPhase, onScale: PhaseVessel | null = null): PhaseChange[] {
    if (phase === 'grind' || (phase === 'milk' && !this.#milkOffered)) return [];
    if (phase !== this.#current && phase !== 'extraction') {
      this.#container = null;
      this.#carried = 0;
    }
    this.#keepLast = false;
    this.#adopted = false;
    this.#adopting = phase === 'beans' || phase === 'extraction' ? phase : null;
    const changes = this.#open(phase, 'user');
    if (onScale !== null && onScale.massG > this.#doseG && this.#adopting !== null) {
      this.#adopting = null;
      if (onScale.container === null || this.#phaseFor(onScale.container) !== phase) {
        this.#adopt();
      }
    }
    return changes;
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

  /**
   * The vessel on is the open phase's container, though unknown (T3.24): the beans count from 0 in
   * it, and it carries nothing, so the scale is tared for it.
   */
  #adopt(): PhaseChange[] {
    this.#adopted = true;
    this.#container = null;
    this.#carried = 0;
    this.#keepLast = false;
    if (this.#current === 'beans') this.#loads = { ...this.#loads, beans: null };
    return this.#announced === null ? this.#open(this.#current, 'container') : [];
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
