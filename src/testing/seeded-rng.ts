/**
 * Deterministic PRNG (linear congruential). Used wherever a test needs a
 * source of randomness — key shuffling in particular — while still drawing
 * the exact same sequence on every run.
 */
export function seededRng(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}
