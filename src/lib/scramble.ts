import { algToOuterMoves, invertOuterMoves, outerMovesToString } from "./cube/alg";

/**
 * Scrambles come in three flavours, and each is practised on its own.
 *
 * - **full**: a WCA 3BLD scramble.
 * - **edges**: corners solved, edges anywhere they can legally be.
 * - **corners**: edges solved, corners anywhere they can legally be.
 *
 * The one-piece-type scrambles are built as states rather than as algorithms:
 * a random legal permutation and orientation of that piece type, handed to
 * the two-phase solver, whose solution inverted is a scramble of normal
 * length (about 19 moves) reaching exactly that state. Composing random
 * commutators instead would produce long, lopsided scrambles that give away
 * what they contain.
 */

export type ScrambleMode = "full" | "edges" | "corners";

export const SCRAMBLE_MODES: ScrambleMode[] = ["full", "edges", "corners"];

export const MODE_LABEL: Record<ScrambleMode, string> = {
  full: "Full",
  edges: "Edges",
  corners: "Corners",
};

export const MODE_HINT: Record<ScrambleMode, string> = {
  full: "WCA 3BLD scramble",
  edges: "corners stay solved",
  corners: "edges stay solved",
};

export function isScrambleMode(x: unknown): x is ScrambleMode {
  return x === "full" || x === "edges" || x === "corners";
}

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

/** Permutation parity: 0 for even, 1 for odd. */
export function permutationParity(p: number[]): 0 | 1 {
  const seen = new Array(p.length).fill(false);
  let parity = 0;
  for (let i = 0; i < p.length; i++) {
    if (seen[i]) continue;
    let length = 0;
    let j = i;
    while (!seen[j]) {
      seen[j] = true;
      j = p[j];
      length++;
    }
    parity ^= (length - 1) & 1;
  }
  return parity as 0 | 1;
}

/**
 * A random legal state of one piece type, with the other type solved.
 *
 * Two laws of the cube decide what "legal" means here. Permutation parity is
 * shared between corners and edges, so with one type solved (an even
 * permutation) the other must be even too. And total orientation is fixed:
 * edge flips sum to 0 mod 2, corner twists to 0 mod 3. Both are repaired on
 * the first piece rather than redrawn, which costs nothing and keeps the
 * draw uniform over the legal states.
 */
export function randomOrbit(
  count: number,
  twists: 2 | 3,
  random: () => number = Math.random,
): { pieces: number[]; orientation: number[] } {
  const pieces = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
  }
  if (permutationParity(pieces) === 1) [pieces[0], pieces[1]] = [pieces[1], pieces[0]];

  const orientation = Array.from({ length: count }, () => Math.floor(random() * twists));
  const sum = orientation.reduce((a, b) => a + b, 0) % twists;
  orientation[0] = (orientation[0] + twists - sum) % twists;
  return { pieces, orientation };
}

async function pieceTypeScramble(mode: "edges" | "corners"): Promise<string> {
  const [{ cube3x3x3 }, { KPattern }, { experimentalSolve3x3x3IgnoringCenters }] = await Promise.all([
    import("cubing/puzzles"),
    import("cubing/kpuzzle"),
    import("cubing/search"),
  ]);
  const kpuzzle = await cube3x3x3.kpuzzle();
  const patternData = structuredClone(kpuzzle.defaultPattern().patternData);
  if (mode === "edges") patternData.EDGES = randomOrbit(12, 2);
  else patternData.CORNERS = randomOrbit(8, 3);

  // the solution of a state, played backwards, is a scramble reaching it
  const solution = await experimentalSolve3x3x3IgnoringCenters(new KPattern(kpuzzle, patternData));
  return outerMovesToString(invertOuterMoves(algToOuterMoves(solution.toString())));
}

/** A scramble for the given mode, ready to be shown and followed. */
export async function generateScramble(mode: ScrambleMode): Promise<string> {
  if (mode !== "full") return pieceTypeScramble(mode);
  const { randomScrambleForEvent } = await import("cubing/scramble");
  // kept in its original notation, wide orientation suffix and all: the
  // follower displays those tokens and matches them against the outer turns
  // the cube reports
  return cleanScramble(async () => (await randomScrambleForEvent("333bf")).toString());
}
