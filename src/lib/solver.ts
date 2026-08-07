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

/**
 * Short move sequence taking the cube from the state after `all` moves back
 * to the state after only `prefix` moves (both from the same start, e.g. a
 * DNF's end state back to just before the mistake).
 *
 * The difference is prefix⁻¹·all — built purely from known moves, no state
 * conversion needed — and cubing.js solves it. Falls back to the literal
 * undo (inverse of the tail) when the solver is unavailable.
 */
export async function movesBackTo(prefix: OuterMove[], all: OuterMove[]): Promise<OuterMove[]> {
  const tail = all.slice(prefix.length);
  const literalUndo = invertOuterMoves(tail);
  if (literalUndo.length <= 8) return literalUndo;
  try {
    const [{ cube3x3x3 }, { experimentalSolve3x3x3IgnoringCenters }, { outerMoveFromString }] =
      await Promise.all([import("cubing/puzzles"), import("cubing/search"), import("./cube/alg")]);
    const kpuzzle = await cube3x3x3.kpuzzle();
    const diffAlg = `${outerMovesToString(invertOuterMoves(prefix))} ${outerMovesToString(all)}`.trim();
    const pattern = kpuzzle.defaultPattern().applyAlg(diffAlg);
    const solution = await experimentalSolve3x3x3IgnoringCenters(pattern);
    const moves = solution
      .toString()
      .split(/\s+/)
      .filter(Boolean)
      .map(outerMoveFromString);
    return moves.length < literalUndo.length ? moves : literalUndo;
  } catch {
    return literalUndo;
  }
}
