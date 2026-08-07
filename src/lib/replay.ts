import { algToOuterMoves, outerMoveFromString, outerMoveToString, parseAlg } from "./cube/alg";
import { FACES, ROTATION_FACE_MAPS, type Face } from "./cube/geometry";
import { applyMove, solvedState, type CubeState, type OuterMove } from "./cube/state";
import type { SolveRecord } from "./storage/types";

/**
 * Replay model for the solve player.
 *
 * Everything is derived from the two things we know exactly: the scramble and
 * the timed move stream from the cube. No interpretation, no guessing — the
 * player shows what happened, move by move, and lets the user find the
 * mistake themselves.
 *
 * Frames: `states[i]` is the cube after `i` moves, so `states[0]` is the
 * scrambled cube and `states[n]` the final state. `moves[i]` leads from
 * `states[i]` to `states[i + 1]`.
 */

export type FaceMap = Record<Face, Face>;

const IDENTITY_MAP = (): FaceMap => Object.fromEntries(FACES.map((f) => [f, f])) as FaceMap;

/** compose: apply a, then b. */
function composeMaps(a: FaceMap, b: FaceMap): FaceMap {
  const out = {} as FaceMap;
  for (const f of FACES) out[f] = b[a[f]];
  return out;
}

/**
 * Face map for the user's holding orientation (a rotation sequence like
 * "z2"). `map[f]` is the face that the recorded face `f` appears at once the
 * whole cube is rotated — so rendering `orientation + map(moves)` shows the
 * solve exactly as the user saw it, with their colours on top and front.
 */
export function orientationFaceMap(orientation: string): FaceMap {
  let map = IDENTITY_MAP();
  const trimmed = orientation.trim();
  if (!trimmed) return map;
  let tokens: ReturnType<typeof parseAlg>;
  try {
    tokens = parseAlg(trimmed);
  } catch {
    return map;
  }
  for (const t of tokens) {
    if (t.kind !== "rotation") continue;
    const rot = ROTATION_FACE_MAPS[t.base as "x" | "y" | "z"];
    for (let k = 0; k < t.amount; k++) map = composeMaps(map, rot);
  }
  return map;
}

export function mapMove(m: OuterMove, map: FaceMap): OuterMove {
  return { face: map[m.face], amount: m.amount };
}

export function mapMovesToString(moves: OuterMove[], map: FaceMap): string {
  return moves.map((m) => outerMoveToString(mapMove(m, map))).join(" ");
}

/** Pieces that are home and oriented (max 20). */
export function solvedPieceCount(s: CubeState): number {
  let n = 0;
  for (let i = 0; i < 8; i++) if (s.cp[i] === i && s.co[i] === 0) n++;
  for (let i = 0; i < 12; i++) if (s.ep[i] === i && s.eo[i] === 0) n++;
  return n;
}

/** Slots that are not solved yet, as indices into CORNER_SLOTS / EDGE_SLOTS. */
export function unsolvedSlots(s: CubeState): { corners: number[]; edges: number[] } {
  const corners: number[] = [];
  const edges: number[] = [];
  for (let i = 0; i < 8; i++) if (s.cp[i] !== i || s.co[i] !== 0) corners.push(i);
  for (let i = 0; i < 12; i++) if (s.ep[i] !== i || s.eo[i] !== 0) edges.push(i);
  return { corners, edges };
}

export interface ReplayMove {
  /** as recorded, in the cube's own frame */
  move: OuterMove;
  /** as the user saw it, i.e. rotated into their holding orientation */
  display: string;
  /** ms after the first move */
  t: number;
  /** idle time before this move started */
  gapMs: number;
  /** gapMs is long enough to be a hesitation */
  pause: boolean;
  /** solved pieces after this move (0–20) */
  solvedAfter: number;
}

/** A run of moves with no long pause inside — usually one alg. */
export interface Burst {
  /** inclusive move indices */
  from: number;
  to: number;
  /** pause before the burst started */
  pauseBeforeMs: number;
  /** duration of the burst itself */
  durationMs: number;
  /** pieces solved by this burst (can be negative when it broke something) */
  delta: number;
}

export interface ReplayModel {
  /** setup for the 3D player: orientation rotation + scramble, user frame */
  setupAlg: string;
  moves: ReplayMove[];
  /** length moves.length + 1 */
  states: CubeState[];
  bursts: Burst[];
  /** gap from which on a pause is marked */
  pauseThresholdMs: number;
  totalMs: number;
  faceMap: FaceMap;
  /** true when the last state is fully solved */
  solved: boolean;
}

/** Below this a pause is never marked, however fast the solver turns. */
const MIN_PAUSE_MS = 250;

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function buildReplay(solve: Pick<SolveRecord, "scramble" | "moves">, orientation: string): ReplayModel {
  const faceMap = orientationFaceMap(orientation);

  let scrambleMoves: OuterMove[] = [];
  try {
    scrambleMoves = algToOuterMoves(solve.scramble);
  } catch {
    scrambleMoves = [];
  }
  const start = scrambleMoves.reduce(applyMove, solvedState());

  const raw: OuterMove[] = [];
  for (const m of solve.moves) {
    try {
      raw.push(outerMoveFromString(m.m));
    } catch {
      // a stored move we can no longer parse: skip it rather than lose the solve
    }
  }

  const states: CubeState[] = [start];
  for (const m of raw) states.push(applyMove(states[states.length - 1], m));

  const t0 = solve.moves[0]?.t ?? 0;
  const gaps = solve.moves.map((m, i) => (i === 0 ? 0 : m.t - solve.moves[i - 1].t));
  // hesitation = clearly slower than this solver's own turning speed
  const pauseThresholdMs = Math.max(MIN_PAUSE_MS, Math.round(3 * median(gaps.slice(1))));

  const moves: ReplayMove[] = raw.map((move, i) => ({
    move,
    display: outerMoveToString(mapMove(move, faceMap)),
    t: (solve.moves[i]?.t ?? 0) - t0,
    gapMs: gaps[i] ?? 0,
    pause: i > 0 && (gaps[i] ?? 0) >= pauseThresholdMs,
    solvedAfter: solvedPieceCount(states[i + 1]),
  }));

  const bursts: Burst[] = [];
  for (let i = 0; i < moves.length; i++) {
    if (i === 0 || moves[i].pause) {
      bursts.push({
        from: i,
        to: i,
        pauseBeforeMs: i === 0 ? 0 : moves[i].gapMs,
        durationMs: 0,
        delta: 0,
      });
    }
    const b = bursts[bursts.length - 1];
    b.to = i;
    b.durationMs = moves[i].t - moves[b.from].t;
    b.delta = solvedPieceCount(states[i + 1]) - solvedPieceCount(states[b.from]);
  }

  const setupParts = [orientation.trim(), mapMovesToString(scrambleMoves, faceMap)].filter(Boolean);

  return {
    setupAlg: setupParts.join(" "),
    moves,
    states,
    bursts,
    pauseThresholdMs,
    totalMs: moves.length > 0 ? moves[moves.length - 1].t : 0,
    faceMap,
    solved: solvedPieceCount(states[states.length - 1]) === 20,
  };
}

/**
 * Moves 0..idx as one display string — the setup that brings a cube to the
 * state before move `idx`, used by the 3D player and by "get me back here".
 */
export function displayPrefix(model: ReplayModel, idx: number): string {
  return [model.setupAlg, model.moves.slice(0, idx).map((m) => m.display).join(" ")]
    .filter(Boolean)
    .join(" ");
}
