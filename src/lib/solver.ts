import { invertOuterMoves, outerMovesToString } from "./cube/alg";
import type { OuterMove } from "./cube/state";

/**
 * A short scramble reaching the state that `moves` produces from solved — the
 * practical replacement for "scramble plus the 90 moves you have played so
 * far", which nobody can type in.
 *
 * Length is whatever cubing.js's two-phase solver finds, which is 19–21
 * moves: exactly the length of the scramble the solve started from (its own
 * WCA scrambles come out of the same search). Forcing a hard ≤20 would need
 * an optimal solver and take seconds to minutes per position — not worth ±1
 * move, and the searches around a state all land in the same range anyway.
 *
 * Returns null only when the solver is unavailable; the caller then keeps the
 * literal move list.
 */
export async function shortScrambleFor(moves: OuterMove[]): Promise<OuterMove[] | null> {
  try {
    const [{ cube3x3x3 }, { experimentalSolve3x3x3IgnoringCenters }, { outerMoveFromString }] =
      await Promise.all([import("cubing/puzzles"), import("cubing/search"), import("./cube/alg")]);
    const kpuzzle = await cube3x3x3.kpuzzle();
    const pattern = kpuzzle.defaultPattern().applyAlg(outerMovesToString(moves));
    // solving the state and undoing that solution reaches the same state
    const solution = await experimentalSolve3x3x3IgnoringCenters(pattern);
    const solved = solution.toString().split(/\s+/).filter(Boolean).map(outerMoveFromString);
    return invertOuterMoves(solved);
  } catch {
    return null;
  }
}
