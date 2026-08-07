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
  /**
   * Net turns of this step in the cube's own frame: one for a face turn, two
   * for a slice, none when the step cancels out (an `R R'` fidget).
   */
  net: OuterMove[];
  /** as the user saw it, i.e. rotated into their holding orientation */
  display: string;
  /** quarter turns the cube reported for this step (R2 arrives as two) */
  quarterTurns: number;
  /** ms after the first move, at the end of the step */
  t: number;
  /** idle time before this step started */
  gapMs: number;
  /** gapMs is long enough to be a hesitation */
  pause: boolean;
  /** turning speed around this point, in moves per second */
  tps: number | null;
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
  /** moves per second inside the burst */
  tps: number | null;
}

export interface ReplayModel {
  /** setup for the 3D player: orientation rotation + scramble, user frame */
  setupAlg: string;
  /** the scramble in the cube's own frame */
  scrambleMoves: OuterMove[];
  moves: ReplayMove[];
  /** length moves.length + 1 */
  states: CubeState[];
  bursts: Burst[];
  /** gap from which on a pause is marked */
  pauseThresholdMs: number;
  /** time spent standing still between bursts */
  pauseTotalMs: number;
  totalMs: number;
  faceMap: FaceMap;
  /** true when the last state is fully solved */
  solved: boolean;
}

/** Below this a pause is never marked, however fast the solver turns. */
const MIN_PAUSE_MS = 250;

/** Moves the turning-speed curve averages over. */
const TPS_WINDOW = 5;

/**
 * Shortest span a turning rate is computed over. Two turns cannot really be
 * this close together; when timestamps say otherwise (a batch arriving at
 * once) the rate would be nonsense, so we report none.
 */
const MIN_RATE_SPAN_MS = 20;

/** Turns per second across `intervals` gaps spanning `ms`. */
function rate(intervals: number, ms: number): number | null {
  return intervals > 0 && ms >= MIN_RATE_SPAN_MS ? (intervals / ms) * 1000 : null;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

interface RawTurn {
  move: OuterMove;
  t: number;
  gap: number;
}

/** A step of the replay before it is rendered. */
interface Step {
  raws: RawTurn[];
  /** net outer turns in the cube's own frame; empty when the step cancels */
  net: OuterMove[];
  /** the slice this step is, when it is one */
  slice: { axis: Axis; amount: number } | null;
  gap: number;
  t: number;
}

type Axis = "x" | "y" | "z";

/**
 * Which axis a face belongs to, and which of the pair the slice direction
 * follows: `M` follows `R`, `E` follows `U`, `S` follows `B`.
 */
const AXIS_OF: Record<Face, { axis: Axis; leads: boolean }> = {
  R: { axis: "x", leads: true },
  L: { axis: "x", leads: false },
  U: { axis: "y", leads: true },
  D: { axis: "y", leads: false },
  B: { axis: "z", leads: true },
  F: { axis: "z", leads: false },
};

const SLICE_LETTER: Record<Axis, string> = { x: "M", y: "E", z: "S" };

const suffix = (amount: number) => (amount === 2 ? "2" : amount === 3 ? "'" : "");

/** A single face turn of this step, or null (slice, cancelled, unmerged). */
function faceTurn(step: Step): OuterMove | null {
  return !step.slice && step.net.length === 1 ? step.net[0] : null;
}

/**
 * Quarter turns as the cube reports them, grouped into the moves a cuber
 * would write down. Three passes, each only joining turns that were not
 * separated by a pause — a regrip in the middle stays visible as two steps:
 *
 * 1. same face: `R R` is one `R2`, `R' R'` too;
 * 2. opposite faces turning against each other: `R L'` is `M`. A cube without
 *    a gyro reports a slice exactly like that pair — the two are the same
 *    event down to the millisecond — and in a blindfolded solve it is
 *    virtually always the slice, which is what commutators are written in;
 * 3. same slice again, for cubes that report `M2` as two separate halves.
 */
function buildSteps(raw: RawTurn[], pauseThresholdMs: number): Step[] {
  const joins = (gap: number) => gap < pauseThresholdMs;

  // 1. same face
  const groups: RawTurn[][] = [];
  for (const turn of raw) {
    const last = groups[groups.length - 1];
    if (last && last[0].move.face === turn.move.face && joins(turn.gap)) last.push(turn);
    else groups.push([turn]);
  }
  let steps: Step[] = groups.map((group) => {
    const face = group[0].move.face;
    const amount = group.reduce((a, g) => a + g.move.amount, 0) % 4;
    return {
      raws: group,
      net: amount === 0 ? [] : [{ face, amount } as OuterMove],
      slice: null,
      gap: group[0].gap,
      t: group[group.length - 1].t,
    };
  });

  // 2. opposite faces -> slice
  const paired: Step[] = [];
  for (let i = 0; i < steps.length; i++) {
    const a = faceTurn(steps[i]);
    const b = i + 1 < steps.length ? faceTurn(steps[i + 1]) : null;
    const sameAxis = a && b && AXIS_OF[a.face].axis === AXIS_OF[b.face].axis && a.face !== b.face;
    // the two outer layers turn against each other exactly when the middle
    // layer is what moved
    if (sameAxis && (a.amount + b.amount) % 4 === 0 && joins(steps[i + 1].gap)) {
      const lead = AXIS_OF[a.face].leads ? a : b!;
      paired.push({
        raws: [...steps[i].raws, ...steps[i + 1].raws],
        net: [a, b!],
        slice: { axis: AXIS_OF[a.face].axis, amount: lead.amount },
        gap: steps[i].gap,
        t: steps[i + 1].t,
      });
      i++;
    } else {
      paired.push(steps[i]);
    }
  }
  steps = paired;

  // 3. same slice
  const merged: Step[] = [];
  for (const step of steps) {
    const last = merged[merged.length - 1];
    if (last?.slice && step.slice && last.slice.axis === step.slice.axis && joins(step.gap)) {
      const amount = (last.slice.amount + step.slice.amount) % 4;
      last.raws = [...last.raws, ...step.raws];
      last.net = amount === 0 ? [] : [...last.net, ...step.net];
      last.slice = amount === 0 ? null : { axis: last.slice.axis, amount };
      last.t = step.t;
    } else {
      merged.push({ ...step });
    }
  }
  return merged;
}

/** The face whose direction each slice follows. */
const SLICE_LEAD: Record<Axis, Face> = { x: "R", y: "U", z: "B" };

/**
 * A slice named as the user sees it: rotating the cube can move the slice to
 * another axis and reverse the face it follows, so under z2 the same physical
 * middle-layer turn reads as M'.
 */
function renderSlice(axis: Axis, amount: number, faceMap: FaceMap): string {
  const seen = AXIS_OF[faceMap[SLICE_LEAD[axis]]];
  return SLICE_LETTER[seen.axis] + suffix(seen.leads ? amount : (4 - amount) % 4);
}

/** How the step reads in the frame the user holds the cube in. */
function renderStep(step: Step, faceMap: FaceMap): string {
  if (step.slice) return renderSlice(step.slice.axis, step.slice.amount, faceMap);
  if (step.net.length === 1) return outerMoveToString(mapMove(step.net[0], faceMap));
  // cancels out: showing the turns as played says more than nothing
  return step.raws.map((r) => outerMoveToString(mapMove(r.move, faceMap))).join(" ");
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

  const t0 = solve.moves[0]?.t ?? 0;
  const raw: RawTurn[] = [];
  solve.moves.forEach((m, i) => {
    try {
      raw.push({
        move: outerMoveFromString(m.m),
        t: m.t - t0,
        gap: i === 0 ? 0 : m.t - solve.moves[i - 1].t,
      });
    } catch {
      // a stored move we can no longer parse: skip it rather than lose the solve
    }
  });

  // hesitation = clearly slower than this solver's own turning speed. Below a
  // handful of turns there is no meaningful speed to compare against, so the
  // floor decides on its own.
  const intervals = raw.slice(1).map((r) => r.gap);
  const pauseThresholdMs =
    intervals.length >= 4 ? Math.max(MIN_PAUSE_MS, Math.round(3 * median(intervals))) : MIN_PAUSE_MS;

  const moves: ReplayMove[] = buildSteps(raw, pauseThresholdMs).map((step, i) => ({
    net: step.net,
    display: renderStep(step, faceMap),
    quarterTurns: step.raws.length,
    t: step.t,
    gapMs: step.gap,
    pause: i > 0 && step.gap >= pauseThresholdMs,
    tps: null,
  }));

  // turning speed over a short window, so a slow patch stands out
  moves.forEach((m, i) => {
    const from = Math.max(0, i - TPS_WINDOW);
    m.tps = rate(i - from, m.t - moves[from].t);
  });

  const states: CubeState[] = [start];
  for (const m of moves) states.push(m.net.reduce(applyMove, states[states.length - 1]));

  const bursts: Burst[] = [];
  for (let i = 0; i < moves.length; i++) {
    if (i === 0 || moves[i].pause) {
      bursts.push({ from: i, to: i, pauseBeforeMs: i === 0 ? 0 : moves[i].gapMs, durationMs: 0, tps: null });
    }
    const b = bursts[bursts.length - 1];
    b.to = i;
    b.durationMs = moves[i].t - moves[b.from].t;
    b.tps = rate(b.to - b.from, b.durationMs);
  }

  const setupParts = [orientation.trim(), mapMovesToString(scrambleMoves, faceMap)].filter(Boolean);

  return {
    setupAlg: setupParts.join(" "),
    scrambleMoves,
    moves,
    states,
    bursts,
    pauseThresholdMs,
    pauseTotalMs: moves.reduce((sum, m) => (m.pause ? sum + m.gapMs : sum), 0),
    totalMs: moves.length > 0 ? moves[moves.length - 1].t : 0,
    faceMap,
    solved: solvedPieceCount(states[states.length - 1]) === 20,
  };
}

/**
 * Execution time elapsed after `idx` moves, on the timer's clock.
 *
 * Move timestamps start at zero with the *first* turn, while the execution
 * clock starts when the memo ended — the difference is the moment before the
 * first turn. Anchoring on `execMs` puts both on the same scale, so the value
 * at the last move is exactly the execution time of the solve.
 */
export function elapsedExecMs(model: ReplayModel, idx: number, execMs: number): number {
  if (idx <= 0) return 0;
  const offset = Math.max(0, execMs - model.totalMs);
  return offset + model.moves[Math.min(idx, model.moves.length) - 1].t;
}

/**
 * Turns per second up to that point in the solve; null while there is not
 * enough elapsed time to divide by. At the end of the replay this is the
 * solve's own TPS (moves / execution time).
 */
export function tpsAt(model: ReplayModel, idx: number, execMs: number): number | null {
  const ms = elapsedExecMs(model, idx, execMs);
  if (idx <= 0 || ms <= 0) return null;
  return idx / (ms / 1000);
}

/** Scramble plus the first `idx` solve moves, in the cube's own frame. */
export function corePrefix(model: ReplayModel, idx: number): OuterMove[] {
  return [...model.scrambleMoves, ...model.moves.slice(0, idx).flatMap((m) => m.net)];
}

/** Any core-frame sequence written the way the user holds the cube. */
export function toDisplayAlg(model: ReplayModel, moves: OuterMove[], orientation: string): string {
  return [orientation.trim(), mapMovesToString(moves, model.faceMap)].filter(Boolean).join(" ");
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
