import { algToOuterMoves } from "./cube/alg";

/**
 * 3BLD scrambles end with a random orientation written as wide moves, and
 * cubing.js does not check that suffix against the scramble it follows. About
 * one in six comes out like
 *
 *   L2 U2 L2 Rw' Dw
 *
 * where `Rw'` is `L' x'`, so the `L2` and the suffix merge into a single `L` —
 * a wasted turn while scrambling, and a same-face pair in the move stream the
 * cube reports.
 *
 * Translating the whole scramble into the outer turns a smart cube reports
 * makes this trivial to spot: no proper scramble ever turns the same face
 * twice in a row.
 */
export function hasRedundantTurn(alg: string): boolean {
  let moves;
  try {
    moves = algToOuterMoves(alg);
  } catch {
    // unparseable: not our call to reject it
    return false;
  }
  return moves.some((m, i) => i > 0 && moves[i - 1].face === m.face);
}

/**
 * Draw scrambles until one is clean. Bounded, and the last draw is used
 * either way — a slightly awkward scramble beats no scramble.
 */
export async function cleanScramble(
  generate: () => Promise<string>,
  tries = 6,
): Promise<string> {
  let alg = await generate();
  for (let i = 1; i < tries && hasRedundantTurn(alg); i++) alg = await generate();
  return alg;
}
