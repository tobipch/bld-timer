import { invertOuterMoves, outerMovesToString } from "./cube/alg";
import type { OuterMove } from "./cube/state";

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
