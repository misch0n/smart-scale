/**
 * Seeded pseudo-random numbers for the simulator. The same seed gives the same numbers, so a
 * simulated session, and any test failure on one, replays exactly. That holds on one JS engine:
 * `Math.log` and `Math.cos` may differ in the last bit between engines.
 *
 * The generator is sfc32, seeded through splitmix32. Neither is cryptographic, and a simulator
 * doesn't need that.
 *
 * Use one stream per purpose (`fork`). A fork is derived from its parent's seed and a label,
 * not from how far the parent has got, so turning on one effect (dropped frames, say) leaves the
 * numbers every other effect draws unchanged. That keeps A/B comparisons between parameter sets
 * honest: only the parameter changes, not the noise.
 */

const UINT32_RANGE = 2 ** 32;

export class Rng {
  /** The 32-bit seed this generator started from. */
  readonly seed: number;
  #a: number;
  #b: number;
  #c: number;
  #d: number;

  /** @throws RangeError unless `seed` is an integer in 0 to 2^32 − 1. */
  constructor(seed: number) {
    if (!Number.isInteger(seed) || seed < 0 || seed >= UINT32_RANGE) {
      throw new RangeError(`Rng: seed ${seed} is not an integer in 0 to 2^32 - 1`);
    }
    this.seed = seed;
    const init = splitmix32(seed);
    this.#a = init();
    this.#b = init();
    this.#c = init();
    this.#d = init();
    for (let i = 0; i < 15; i++) this.uint32();
  }

  /** An independent stream for one purpose, from this generator's seed and `label`. */
  fork(label: string): Rng {
    return new Rng(splitmix32((this.seed ^ fnv1a(label)) >>> 0)());
  }

  /** A uniform integer in 0 to 2^32 − 1. */
  uint32(): number {
    const t = (((this.#a + this.#b) | 0) + this.#d) | 0;
    this.#d = (this.#d + 1) | 0;
    this.#a = this.#b ^ (this.#b >>> 9);
    this.#b = (this.#c + (this.#c << 3)) | 0;
    this.#c = (this.#c << 21) | (this.#c >>> 11);
    this.#c = (this.#c + t) | 0;
    return t >>> 0;
  }

  /** Uniform in [0, 1). */
  next(): number {
    return this.uint32() / UINT32_RANGE;
  }

  /** Uniform in [min, max). */
  uniform(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** A uniform integer in 0 to n − 1. */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  /**
   * A standard normal value (Box–Muller). It always takes exactly two draws, with no cached
   * spare, so every caller's draw count is fixed and streams stay aligned across runs.
   */
  gaussian(): number {
    const u = 1 - this.next(); // (0, 1], so the log is finite
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Exponentially distributed with the given mean. One draw. */
  exponential(mean: number): number {
    return -mean * Math.log(1 - this.next());
  }
}

/** splitmix32: spreads one 32-bit seed into a sequence of well-mixed 32-bit values. */
function splitmix32(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x9e3779b9) | 0;
    let t = state ^ (state >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    t ^= t >>> 15;
    return t >>> 0;
  };
}

/** 32-bit FNV-1a over UTF-16 code units. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
