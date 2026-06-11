import {
  applyMove,
  composeTransforms,
  diffStates,
  invertTransform,
  isSolved,
  solvedState,
  statesEqual,
  transformBetween,
  type CubeState,
  type OuterMove,
} from "../cube/state";
import { classifyDiff, unsolvedSummary, type BufferRefs, type Primitive } from "./classify";
import { continuationFor, type Continuation } from "./suggest";

export interface TimedMove {
  move: OuterMove;
  /** milliseconds, monotonic within a solve (cube timestamp preferred) */
  t: number;
}

export interface StepProgress {
  /** pieces (other than the comm's buffer) that became solved */
  newlySolved: number;
  /** previously solved pieces (other than the buffer) this step displaced */
  broke: number;
  /** a comm that solves nothing or breaks pieces is almost surely a mistrace */
  suspicious: boolean;
  /** for suspicious comms: what the state actually called for */
  suggestion?: Continuation;
}

export interface ReconstructionStep {
  kind: "case" | "noop" | "unknown";
  primitive: Primitive | null;
  /** move index range, inclusive */
  startIdx: number;
  endIdx: number;
  moves: OuterMove[];
  /** time from first to last move of the segment */
  execMs: number;
  /** time from the end of the previous segment to this segment's first move */
  recogMs: number;
  /** progress accounting, for comm steps */
  progress?: StepProgress;
}

export interface MistakeDiagnosis {
  kind: "missing-case" | "inverted-case" | "small-mistake" | "wrong-case";
  /** missing/inverted: the primitive that is left to solve / to insert */
  missing?: Primitive;
  /** missing-case: the case fits after this step (-1 = before everything) */
  insertAfterStepIdx?: number;
  /** wrong-case: which executed step was wrong */
  wrongStepIdx?: number;
  /** wrong-case: what that step should have done */
  shouldHaveBeen?: Primitive;
  /** wrong-case: the step was exactly the inverse of what was needed */
  invertedExecution?: boolean;
  /** legacy field for stored solves */
  invertedStepIdx?: number;
  /** small-mistake: solve-global index of the move where it went wrong */
  atMoveIdx?: number;
  /** the move that was played there (null = a move was missing) */
  played?: OuterMove | null;
  /** the move that should have been played (null = the move was extra) */
  shouldHave?: OuterMove | null;
  /** re-parse of everything from the mistake on, under the correction */
  hypothetical?: { steps: ReconstructionStep[]; solved: boolean };
}

export interface Reconstruction {
  steps: ReconstructionStep[];
  solved: boolean;
  /** unsolved pieces at the end (slot names), when not solved */
  leftover: { corners: string[]; edges: string[] } | null;
  /** index of the first move after the last explained segment, when unsolved */
  brokenFromIdx: number | null;
  totalMoves: number;
  /** all detected problems (edges and corners are diagnosed independently) */
  findings: MistakeDiagnosis[];
  /** first finding, kept for older stored solves */
  diagnosis: MistakeDiagnosis | null;
}

/** Longest segment we try to explain as a single case. */
const MAX_SEGMENT = 32;

/** An inter-move pause above this marks a likely boundary between cases. */
const DEFAULT_GAP_MS = 350;

interface DpEntry {
  unexplained: number;
  /** case segments that make no solving progress (likely artifacts) */
  suspicious: number;
  /** big time gaps swallowed inside explained segments */
  gaps: number;
  segments: number;
  prev: number;
  prim: Primitive | null; // null marks a single unknown move
}

function better(a: DpEntry, b: DpEntry): boolean {
  if (a.unexplained !== b.unexplained) return a.unexplained < b.unexplained;
  // gaps outrank suspicion: fusing two cases across a thinking pause can
  // produce a clean, progress-making composite (two 3-cycles sharing the
  // buffer compose into another 3-cycle) — the pause is the tell
  if (a.gaps !== b.gaps) return a.gaps < b.gaps;
  if (a.suspicious !== b.suspicious) return a.suspicious < b.suspicious;
  return a.segments < b.segments;
}

/** Solving progress a comm makes (its own buffer slot excluded). */
function commProgress(
  before: CubeState,
  after: CubeState,
  prim: Extract<Primitive, { type: "cornerComm" | "edgeComm" }>,
): { newlySolved: number; broke: number } {
  const isCorner = prim.type === "cornerComm";
  const permB = isCorner ? before.cp : before.ep;
  const oriB = isCorner ? before.co : before.eo;
  const permA = isCorner ? after.cp : after.ep;
  const oriA = isCorner ? after.co : after.eo;
  const count = isCorner ? 8 : 12;
  let newlySolved = 0;
  let broke = 0;
  for (let s = 0; s < count; s++) {
    if (s === prim.buffer.slot) continue;
    const wasSolved = permB[s] === s && oriB[s] === 0;
    const nowSolved = permA[s] === s && oriA[s] === 0;
    if (!wasSolved && nowSolved) newlySolved++;
    if (wasSolved && !nowSolved) broke++;
  }
  return { newlySolved, broke };
}

/**
 * A comm that solves nothing is almost surely a mistrace. Displacing solved
 * pieces alone is NOT suspicious: with parity pending, the final comms
 * legitimately park a solved piece for the parity alg to restore.
 */
function isSuspiciousComm(before: CubeState, after: CubeState, prim: Primitive): boolean {
  if (prim.type !== "cornerComm" && prim.type !== "edgeComm") return false;
  return commProgress(before, after, prim).newlySolved === 0;
}

/**
 * Segment the executed moves into BLD primitives via dynamic programming.
 * Cost, lexicographic: (1) unexplained moves, (2) recognition-pause-sized
 * time gaps hidden inside segments, (3) segment count.
 *
 * The gap term disambiguates the two failure modes of pure state matching:
 * adjacent real cases can compose into another valid primitive (corner comm
 * + parity looks like one LTCT) — but merging them swallows the thinking
 * pause between the algs, so the split parse wins. Conversely an accidental
 * clean state mid-alg has no pause at it, so splitting there buys nothing
 * and the single-case parse wins on segment count.
 */
export function reconstructSolve(
  startState: CubeState,
  timedMoves: TimedMove[],
  buffers: BufferRefs,
  gapMs = DEFAULT_GAP_MS,
  diagnose = true,
): Reconstruction {
  const n = timedMoves.length;
  const states: CubeState[] = new Array(n + 1);
  states[0] = startState;
  for (let i = 0; i < n; i++) states[i + 1] = applyMove(states[i], timedMoves[i].move);

  // bigGapBefore[i]: pause between move i-1 and move i exceeds the threshold
  const gapPrefix = new Array<number>(n + 1).fill(0);
  for (let i = 1; i < n; i++) {
    gapPrefix[i + 1] = gapPrefix[i] + (timedMoves[i].t - timedMoves[i - 1].t > gapMs ? 1 : 0);
  }
  // number of big gaps strictly inside moves [j, i)
  const gapsInside = (j: number, i: number) => (i - j < 2 ? 0 : gapPrefix[i] - gapPrefix[j + 1]);

  const dp: DpEntry[] = new Array(n + 1);
  dp[0] = { unexplained: 0, suspicious: 0, gaps: 0, segments: 0, prev: -1, prim: null };
  for (let i = 1; i <= n; i++) {
    // fallback: previous best plus one unexplained move
    let best: DpEntry = {
      unexplained: dp[i - 1].unexplained + 1,
      suspicious: dp[i - 1].suspicious,
      gaps: dp[i - 1].gaps,
      segments: dp[i - 1].segments,
      prev: i - 1,
      prim: null,
    };
    for (let j = Math.max(0, i - MAX_SEGMENT); j < i; j++) {
      const prim = classifyDiff(diffStates(states[j], states[i]), buffers);
      if (!prim) continue;
      const cand: DpEntry = {
        unexplained: dp[j].unexplained,
        // a "comm" that solves nothing is more likely a parsing artifact
        // than something a solver actually intended
        suspicious: dp[j].suspicious + (isSuspiciousComm(states[j], states[i], prim) ? 1 : 0),
        gaps: dp[j].gaps + gapsInside(j, i),
        segments: dp[j].segments + 1,
        prev: j,
        prim,
      };
      if (better(cand, best)) best = cand;
    }
    dp[i] = best;
  }

  // walk back, then merge runs of unknown single moves into blocks
  const rawSegs: { start: number; end: number; prim: Primitive | null }[] = [];
  for (let i = n; i > 0; ) {
    const e = dp[i];
    rawSegs.unshift({ start: e.prev, end: i, prim: e.prim });
    i = e.prev;
  }

  // Peel cancelling fidget moves off case boundaries: a head/tail that nets
  // to identity leaves the segment's diff unchanged but would pollute the
  // recorded alg, so split it out as an explicit no-op.
  const peeled: typeof rawSegs = [];
  for (const seg of rawSegs) {
    if (!seg.prim || seg.prim.type === "noop") {
      peeled.push(seg);
      continue;
    }
    let { start, end } = seg;
    for (let k = 2; k < end - start; k++) {
      if (statesEqual(states[start + k], states[start])) {
        peeled.push({ start, end: start + k, prim: { type: "noop" } });
        start += k;
        break;
      }
    }
    let tail: { start: number; end: number } | null = null;
    for (let k = 2; k < end - start; k++) {
      if (statesEqual(states[end - k], states[end])) {
        tail = { start: end - k, end };
        end -= k;
        break;
      }
    }
    peeled.push({ start, end, prim: seg.prim });
    if (tail) peeled.push({ ...tail, prim: { type: "noop" } });
  }

  const merged: { start: number; end: number; prim: Primitive | null }[] = [];
  for (const seg of peeled) {
    const last = merged[merged.length - 1];
    const bothUnknown = seg.prim === null && last && last.prim === null;
    const bothNoop = seg.prim?.type === "noop" && last?.prim?.type === "noop";
    if ((bothUnknown || bothNoop) && last.end === seg.start) {
      last.end = seg.end;
    } else {
      merged.push({ ...seg });
    }
  }

  const steps: ReconstructionStep[] = [];
  let prevEndT = n > 0 ? timedMoves[0].t : 0;
  for (const seg of merged) {
    const moves = timedMoves.slice(seg.start, seg.end).map((m) => m.move);
    const firstT = timedMoves[seg.start].t;
    const lastT = timedMoves[seg.end - 1].t;
    steps.push({
      kind: seg.prim === null ? "unknown" : seg.prim.type === "noop" ? "noop" : "case",
      primitive: seg.prim,
      startIdx: seg.start,
      endIdx: seg.end - 1,
      moves,
      execMs: Math.max(0, lastT - firstT),
      recogMs: Math.max(0, firstT - prevEndT),
    });
    prevEndT = lastT;
  }

  markPseudoSwaps(steps);

  annotateProgress(steps, states);

  const finalState = states[n];
  const solved = isSolved(finalState);
  let leftover: Reconstruction["leftover"] = null;
  let brokenFromIdx: number | null = null;
  let findings: MistakeDiagnosis[] = [];
  if (!solved) {
    leftover = unsolvedSummary(diffStates(finalState, solvedState()));
    let lastExplainedEnd = -1;
    for (const s of steps) if (s.kind !== "unknown") lastExplainedEnd = s.endIdx;
    brokenFromIdx = lastExplainedEnd + 1;
    if (diagnose) {
      findings = diagnoseMistakes(states, timedMoves, steps, buffers, gapMs);
    }
  }

  return {
    steps,
    solved,
    leftover,
    brokenFromIdx,
    totalMoves: n,
    findings,
    diagnosis: findings[0] ?? null,
  };
}

/**
 * Per-step progress accounting. A correct comm always solves at least one
 * piece and never displaces solved pieces (other than its own buffer piece
 * leaving on a cycle break) — a comm violating that is almost certainly a
 * mistrace, and the state tells us what should have happened instead.
 */
function annotateProgress(steps: ReconstructionStep[], states: CubeState[]) {
  for (const step of steps) {
    const p = step.primitive;
    if (!p || (p.type !== "cornerComm" && p.type !== "edgeComm")) continue;
    const before = states[step.startIdx];
    const after = states[step.endIdx + 1];
    const { newlySolved, broke } = commProgress(before, after, p);
    const suspicious = newlySolved === 0;
    step.progress = { newlySolved, broke, suspicious };
    if (suspicious) {
      step.progress.suggestion = continuationFor(before, p.buffer);
    }
  }
}

const ALL_MOVES: OuterMove[] = (["U", "D", "L", "R", "F", "B"] as const).flatMap((face) =>
  ([1, 2, 3] as const).map((amount) => ({ face, amount })),
);

const sameMove = (a: OuterMove, b: OuterMove) => a.face === b.face && a.amount === b.amount;

/** How far from the start of an unknown block we look for the mistake. */
const EDIT_WINDOW = 16;

type Orbit = "all" | "corner" | "edge";

function projectTransform(t: CubeState, orbit: Orbit): CubeState {
  if (orbit === "all") return t;
  if (orbit === "corner")
    return { cp: t.cp, co: t.co, ep: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], eo: new Array(12).fill(0) };
  return { cp: [0, 1, 2, 3, 4, 5, 6, 7], co: new Array(8).fill(0), ep: t.ep, eo: t.eo };
}

const ORBIT_TYPES: Record<Exclude<Orbit, "all">, string[]> = {
  corner: ["cornerComm", "twist"],
  edge: ["edgeComm", "flip"],
};

/**
 * Explain why the solve didn't resolve.
 *
 * 1. With an unexplained block: hypothesis-search single-move edits (a move
 *    deleted, replaced or inserted) near the block start, accepted only if
 *    the entire remainder then parses cleanly.
 * 2. Otherwise solve the group equation. Step diffs are position-independent
 *    permutations, so for each step (or insertion point) we can compute the
 *    unique transformation X with prefix ∘ X ∘ suffix = needed. If X is a
 *    clean primitive: that step was the wrong case (or its exact inverse) /
 *    a case was forgotten there. Corners and edges live in independent
 *    orbits, so when no single fix explains everything, each orbit is
 *    diagnosed separately — one wrong edge comm AND one forgotten corner
 *    comm are both reported.
 */
function diagnoseMistakes(
  states: CubeState[],
  timedMoves: TimedMove[],
  steps: ReconstructionStep[],
  buffers: BufferRefs,
  gapMs: number,
): MistakeDiagnosis[] {
  const firstUnknown = steps.find((s) => s.kind === "unknown");
  if (firstUnknown) {
    const small = diagnoseSmallMistake(states, timedMoves, firstUnknown.startIdx, buffers, gapMs);
    if (small) return [small];
  }

  const T = steps.map((s) => transformBetween(states[s.startIdx], states[s.endIdx + 1]));
  const needed = transformBetween(states[0], solvedState());

  const full = diagnoseAlgebraic(steps, T, needed, buffers, "all");
  if (full) return [full];

  const findings: MistakeDiagnosis[] = [];
  for (const orbit of ["edge", "corner"] as const) {
    const f = diagnoseAlgebraic(steps, T, needed, buffers, orbit);
    if (f) findings.push(f);
  }
  return findings;
}

function diagnoseAlgebraic(
  steps: ReconstructionStep[],
  T: CubeState[],
  needed: CubeState,
  buffers: BufferRefs,
  orbit: Orbit,
): MistakeDiagnosis | null {
  const solved = solvedState();
  const pT = T.map((t) => projectTransform(t, orbit));
  const pNeeded = projectTransform(needed, orbit);
  const k = pT.length;
  // prefix[i] = T_0..T_{i-1}, suffix[i] = T_i..T_{k-1}
  const prefix: CubeState[] = [solved];
  for (let i = 0; i < k; i++) prefix.push(composeTransforms(prefix[i], pT[i]));
  const suffix: CubeState[] = new Array(k + 1);
  suffix[k] = solved;
  for (let i = k - 1; i >= 0; i--) suffix[i] = composeTransforms(pT[i], suffix[i + 1]);

  // this orbit may simply be fine
  if (orbit !== "all" && statesEqual(prefix[k], pNeeded)) return null;

  const classifyTransform = (x: CubeState) => classifyDiff(diffStates(solved, x), buffers);
  const replaceable = (i: number) => {
    if (steps[i].kind === "unknown") return orbit === "all";
    if (steps[i].kind !== "case") return false;
    if (orbit === "all") return true;
    return ORBIT_TYPES[orbit].includes(steps[i].primitive!.type);
  };

  // wrong case: replace step i
  interface WrongCand {
    i: number;
    prim: Primitive;
    inverted: boolean;
    score: number;
  }
  let wrong: WrongCand | null = null;
  for (let i = 0; i < k; i++) {
    if (!replaceable(i)) continue;
    // a suspicious comm (solved nothing / broke pieces) is the prime suspect
    const suspicionBonus = steps[i].progress?.suspicious ? 4 : 0;
    const x = composeTransforms(
      composeTransforms(invertTransform(prefix[i]), pNeeded),
      invertTransform(suffix[i + 1]),
    );
    const prim = classifyTransform(x);
    if (!prim || prim.type === "noop") continue;
    const executedType = steps[i].primitive?.type;
    const inverted = statesEqual(x, invertTransform(pT[i]));
    const score = (prim.type === executedType ? 2 : 0) + (inverted ? 1 : 0) + suspicionBonus;
    if (!wrong || score > wrong.score || (score === wrong.score && i > wrong.i)) {
      wrong = { i, prim, inverted, score };
    }
  }
  if (wrong) {
    return {
      kind: "wrong-case",
      wrongStepIdx: wrong.i,
      shouldHaveBeen: wrong.prim,
      invertedExecution: wrong.inverted,
    };
  }

  // forgotten case: insert X at position p (after step p-1)
  interface InsertCand {
    p: number;
    prim: Primitive;
    score: number;
  }
  let insert: InsertCand | null = null;
  for (let p = 0; p <= k; p++) {
    const x = composeTransforms(
      composeTransforms(invertTransform(prefix[p]), pNeeded),
      invertTransform(suffix[p]),
    );
    const prim = classifyTransform(x);
    if (!prim || prim.type === "noop") continue;
    // "fits" best next to steps of the same type; cases of a type are
    // executed in runs, so following one of its own kind weighs more
    const prevType = p > 0 ? steps[p - 1].primitive?.type : undefined;
    const nextType = p < k ? steps[p].primitive?.type : undefined;
    const score = (prevType === prim.type ? 2 : 0) + (nextType === prim.type ? 1 : 0);
    if (!insert || score > insert.score) insert = { p, prim, score };
  }
  if (insert) {
    return { kind: "missing-case", missing: insert.prim, insertAfterStepIdx: insert.p - 1 };
  }
  return null;
}

function diagnoseSmallMistake(
  states: CubeState[],
  timedMoves: TimedMove[],
  blockStart: number,
  buffers: BufferRefs,
  gapMs: number,
): MistakeDiagnosis | null {
  const start = states[blockStart];
  const rest = timedMoves.slice(blockStart);
  if (rest.length === 0 || rest.length > 250) return null;
  const limit = Math.min(rest.length, EDIT_WINDOW);

  interface Edit {
    j: number;
    played: OuterMove | null;
    shouldHave: OuterMove | null;
    moves: TimedMove[];
  }
  const edits: Edit[] = [];
  for (let j = 0; j <= limit; j++) {
    const t = rest[Math.min(j, rest.length - 1)]?.t ?? 0;
    if (j < rest.length) {
      // this move was extra
      edits.push({ j, played: rest[j].move, shouldHave: null, moves: [...rest.slice(0, j), ...rest.slice(j + 1)] });
      // this move should have been something else
      for (const m of ALL_MOVES) {
        if (sameMove(m, rest[j].move)) continue;
        edits.push({
          j,
          played: rest[j].move,
          shouldHave: m,
          moves: [...rest.slice(0, j), { move: m, t: rest[j].t }, ...rest.slice(j + 1)],
        });
      }
    }
    // a move was missing here
    for (const m of ALL_MOVES) {
      edits.push({ j, played: null, shouldHave: m, moves: [...rest.slice(0, j), { move: m, t }, ...rest.slice(j)] });
    }
  }

  let best: { edit: Edit; rec: Reconstruction } | null = null;
  for (const edit of edits) {
    // cheap pre-filter: some prefix that includes the edit must already form
    // a clean case, otherwise the full re-parse can't possibly be clean
    let s = start;
    let prefixOk = false;
    const scan = Math.min(edit.moves.length, MAX_SEGMENT);
    for (let p = 0; p < scan; p++) {
      s = applyMove(s, edit.moves[p].move);
      if (p + 1 <= edit.j) continue;
      const prim = classifyDiff(diffStates(start, s), buffers);
      if (prim && prim.type !== "noop") {
        prefixOk = true;
        break;
      }
    }
    if (!prefixOk) continue;

    const rec = reconstructSolve(start, edit.moves, buffers, gapMs, false);
    if (rec.steps.some((st) => st.kind === "unknown")) continue;
    const better =
      !best ||
      (rec.solved && !best.rec.solved) ||
      (rec.solved === best.rec.solved && edit.j < best.edit.j);
    if (better) best = { edit, rec };
  }

  if (!best) return null;
  return {
    kind: "small-mistake",
    atMoveIdx: blockStart + best.edit.j,
    played: best.edit.played,
    shouldHave: best.edit.shouldHave,
    hypothetical: { steps: best.rec.steps, solved: best.rec.solved },
  };
}

/**
 * Mark the pseudo-swap edge commutator: with parity pending, the final edge
 * target is solved while sending the displaced piece to the parity edge slot
 * (UF -> target -> UR), and the parity alg later cleans up both 2-swaps.
 */
function markPseudoSwaps(steps: ReconstructionStep[]) {
  const parityIdx = steps.findIndex(
    (s) => s.primitive && (s.primitive.type === "parity" || s.primitive.type === "ltct"),
  );
  if (parityIdx < 0) return;
  const parity = steps[parityIdx].primitive as Extract<Primitive, { type: "parity" | "ltct" }>;
  const paritySlots = parity.edgeSwap.map((r) => r.slot);
  for (let i = parityIdx - 1; i >= 0; i--) {
    const p = steps[i].primitive;
    if (p && p.type === "edgeComm") {
      if (paritySlots.includes(p.targets[1].slot)) p.pseudoSwap = true;
      break;
    }
  }
}
