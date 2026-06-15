import {
  applyMove,
  applyMoves,
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
import { invertOuterMoves } from "../cube/alg";
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
  /** a comm that solves nothing is almost surely a mistrace */
  suspicious: boolean;
  /** a full pair was available but this comm solved fewer than 2 pieces */
  suboptimal?: boolean;
  /** for flagged comms: what the state actually called for */
  suggestion?: Continuation;
}

export interface ReconstructionStep {
  kind: "case" | "noop" | "unknown";
  primitive: Primitive | null;
  /** move index range, inclusive */
  startIdx: number;
  endIdx: number;
  moves: OuterMove[];
  /**
   * Setup moves shared with neighboring cases: the solver executed
   * [setup: this-alg ...] with one wrapper around several cases. The full
   * standalone alg for this case is setup + moves + setup'.
   */
  setupMoves?: OuterMove[];
  /** time from first to last move of the segment */
  execMs: number;
  /** time from the end of the previous segment to this segment's first move */
  recogMs: number;
  /** progress accounting, for comm steps */
  progress?: StepProgress;
}

export interface MistakeDiagnosis {
  kind: "missing-case" | "inverted-case" | "small-mistake" | "wrong-case" | "stray-block";
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

/**
 * Solving progress a comm makes (its own buffer slot excluded), measured
 * toward `goal` — the state the orbit should be in. For most of the solve
 * that is solved; when a parity is pending it is solved-except-the-parity-
 * swap, so a comm that parks pieces into the pseudo-swap arrangement (UF/UR
 * or any alternate pair the parity alg restores) counts as progress.
 */
function commProgress(
  before: CubeState,
  after: CubeState,
  prim: Extract<Primitive, { type: "cornerComm" | "edgeComm" }>,
  goal: CubeState = SOLVED_STATE,
): { newlySolved: number; broke: number } {
  const isCorner = prim.type === "cornerComm";
  const permB = isCorner ? before.cp : before.ep;
  const oriB = isCorner ? before.co : before.eo;
  const permA = isCorner ? after.cp : after.ep;
  const oriA = isCorner ? after.co : after.eo;
  const goalPerm = isCorner ? goal.cp : goal.ep;
  const goalOri = isCorner ? goal.co : goal.eo;
  const count = isCorner ? 8 : 12;
  let newlySolved = 0;
  let broke = 0;
  for (let s = 0; s < count; s++) {
    if (s === prim.buffer.slot) continue;
    const wasSolved = permB[s] === goalPerm[s] && oriB[s] === goalOri[s];
    const nowSolved = permA[s] === goalPerm[s] && oriA[s] === goalOri[s];
    if (!wasSolved && nowSolved) newlySolved++;
    if (wasSolved && !nowSolved) broke++;
  }
  return { newlySolved, broke };
}

const SOLVED_STATE = solvedState();

/**
 * The state the cube should be in just before the parity/LTCT alg: solved
 * with the parity's own 2-swaps undone. Comms are evaluated as progress
 * toward this, so deliberately parking pieces for the parity alg (the
 * pseudo-swap, standard or alternate) reads as solving rather than as a
 * mistrace. Without parity this is simply the solved state.
 */
function preParityGoal(steps: ReconstructionStep[], states: CubeState[]): CubeState {
  const idx = steps.findIndex(
    (s) => s.primitive && (s.primitive.type === "parity" || s.primitive.type === "ltct"),
  );
  if (idx < 0) return SOLVED_STATE;
  return invertTransform(stepEffect(steps[idx], states));
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
 * What a step did as a transformation. For setup-sharing steps the executed
 * span is the inner alg only; the case's true effect is the wrapper
 * conjugate (the absorbed wrapper fragments contribute exactly this).
 */
function stepEffect(step: ReconstructionStep, states: CubeState[]): CubeState {
  const t = transformBetween(states[step.startIdx], states[step.endIdx + 1]);
  if (!step.setupMoves) return t;
  const pT = applyMoves(solvedState(), step.setupMoves);
  return composeTransforms(composeTransforms(pT, t), invertTransform(pT));
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

  const merged: { start: number; end: number; prim: Primitive | null; setup?: OuterMove[] }[] = [];
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

  // Shared setups: executing [P: case case] leaves P and P' as stray
  // unknown fragments around clean cases. Conjugating the interior diffs by
  // P recovers the cases the solver actually memorized (a conjugated
  // 3-cycle is still a 3-cycle, with the intended buffer), so the wrapper
  // is absorbed and each case carries setupMoves.
  for (let i = 0; i < merged.length; i++) {
    const open = merged[i];
    if (open.prim !== null || open.end - open.start > 3) continue;
    const pMoves = timedMoves.slice(open.start, open.end).map((m) => m.move);
    const pInv = invertOuterMoves(pMoves);
    let close = -1;
    for (let j = i + 1; j < merged.length; j++) {
      if (merged[j].prim !== null) continue;
      const qMoves = timedMoves.slice(merged[j].start, merged[j].end).map((m) => m.move);
      if (
        qMoves.length === pInv.length &&
        qMoves.every((m, idx) => m.face === pInv[idx].face && m.amount === pInv[idx].amount)
      ) {
        close = j;
      }
      break; // any other unknown in between disqualifies the pattern
    }
    if (close < 0) continue;
    const interior = merged.slice(i + 1, close);
    if (!interior.some((s) => s.prim && s.prim.type !== "noop")) continue;
    const pT = applyMoves(solvedState(), pMoves);
    const pTInv = invertTransform(pT);
    const conjugated: (Primitive | null)[] = [];
    let ok = true;
    for (const seg of interior) {
      if (!seg.prim || seg.prim.type === "noop") {
        conjugated.push(null);
        continue;
      }
      const t = transformBetween(states[seg.start], states[seg.end]);
      const prim = classifyDiff(
        diffStates(solvedState(), composeTransforms(composeTransforms(pT, t), pTInv)),
        buffers,
      );
      if (!prim || prim.type === "noop") {
        ok = false;
        break;
      }
      conjugated.push(prim);
    }
    if (!ok) continue;
    interior.forEach((seg, idx) => {
      if (conjugated[idx]) {
        seg.prim = conjugated[idx];
        seg.setup = pMoves;
      }
    });
    merged.splice(close, 1);
    merged.splice(i, 1);
    i--;
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
      ...(seg.setup ? { setupMoves: seg.setup } : {}),
      execMs: Math.max(0, lastT - firstT),
      recogMs: Math.max(0, firstT - prevEndT),
    });
    prevEndT = lastT;
  }

  markPseudoSwaps(steps, states);

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
 *
 * Evaluation is counterfactual: unexplained blocks corrupt the cube, but
 * the solver keeps executing against the memo. Steps after a block are
 * judged in the timeline where the block never happened, so correctly
 * executed algs aren't flagged as follow-up errors.
 */
function annotateProgress(steps: ReconstructionStep[], states: CubeState[]) {
  const goal = preParityGoal(steps, states);
  let cf = states[0];
  for (const step of steps) {
    if (step.kind === "unknown") continue; // the block never happened
    const before = cf;
    cf = composeTransforms(cf, stepEffect(step, states));
    const p = step.primitive;
    if (!p || (p.type !== "cornerComm" && p.type !== "edgeComm")) continue;
    const { newlySolved, broke } = commProgress(before, cf, p, goal);
    // a comm that makes no progress toward the pre-parity goal is a mistrace
    // — unless it is the recognized pseudo-swap, which is progress by design
    const suspicious = newlySolved === 0 && !p.pseudoSwap;
    // when the buffer held an unsolved piece, the straightforward pair was
    // available and solves two — settling for one is worth a hint (unless
    // it's the pseudo-swap, which parks a piece by design)
    const cont = continuationFor(before, p.buffer);
    const suboptimal = !suspicious && cont.kind === "pair" && newlySolved < 2 && !p.pseudoSwap;
    step.progress = { newlySolved, broke, suspicious, suboptimal };
    if (suspicious || suboptimal) {
      step.progress.suggestion = cont;
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

  const T = steps.map((s) => stepEffect(s, states));
  const needed = transformBetween(states[0], solvedState());

  const full = diagnoseAlgebraic(steps, T, needed, buffers, "all");
  if (full) return [full];

  const findings: MistakeDiagnosis[] = [];
  for (const orbit of ["edge", "corner"] as const) {
    const f = diagnoseAlgebraic(steps, T, needed, buffers, orbit);
    if (f) findings.push(f);
  }
  if (findings.length > 0) return findings;

  // Everything the solver executed checks out against the memo timeline —
  // the unexplained block alone derailed the cube.
  const blockIdx = steps.findIndex((s) => s.kind === "unknown");
  if (blockIdx >= 0 && steps.every((s) => !s.progress?.suspicious)) {
    return [{ kind: "stray-block", wrongStepIdx: blockIdx }];
  }
  return [];
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
  // comms that made proper progress were what the solver wanted — only
  // suspect steps that solved nothing or settled for half a pair (otherwise
  // a forgotten flip "replaces" a perfectly good comm with an orientation-
  // twisted variant, which is valid algebra but bad advice). Suspicious and
  // unknown steps are strong suspects; suboptimal ones lose to an insertion
  // explanation (a pending flip makes the last comm look suboptimal).
  const suspectStrength = (i: number): "strong" | "weak" | null => {
    if (steps[i].kind === "unknown") return orbit === "all" ? "strong" : null;
    if (steps[i].kind !== "case") return null;
    const prim = steps[i].primitive!;
    if (orbit !== "all" && !ORBIT_TYPES[orbit].includes(prim.type)) return null;
    if (prim.type === "cornerComm" || prim.type === "edgeComm") {
      const p = steps[i].progress;
      if (p?.suspicious) return "strong";
      if (p?.suboptimal) return "weak";
      return p ? null : "weak";
    }
    return "weak"; // parity/twist/flip steps carry no progress information
  };

  // wrong case: replace step i
  interface WrongCand {
    i: number;
    prim: Primitive;
    inverted: boolean;
    strength: "strong" | "weak";
    score: number;
  }
  let wrong: WrongCand | null = null;
  for (let i = 0; i < k; i++) {
    const strength = suspectStrength(i);
    if (!strength) continue;
    const suspicionBonus = strength === "strong" ? 4 : 0;
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
      wrong = { i, prim, inverted, strength, score };
    }
  }
  const wrongFinding: MistakeDiagnosis | null = wrong
    ? {
        kind: "wrong-case",
        wrongStepIdx: wrong.i,
        shouldHaveBeen: wrong.prim,
        invertedExecution: wrong.inverted,
      }
    : null;
  if (wrongFinding && wrong!.strength === "strong") return wrongFinding;

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
    // executed in runs, so following one of its own kind weighs more. On
    // ties take the latest position: a case with no kin (a lone flip) was
    // simply never done, which reads best at the end
    const prevType = p > 0 ? steps[p - 1].primitive?.type : undefined;
    const nextType = p < k ? steps[p].primitive?.type : undefined;
    const score = (prevType === prim.type ? 2 : 0) + (nextType === prim.type ? 1 : 0);
    if (!insert || score >= insert.score) insert = { p, prim, score };
  }
  if (insert) {
    return { kind: "missing-case", missing: insert.prim, insertAfterStepIdx: insert.p - 1 };
  }
  return wrongFinding;
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
 * Mark the pseudo-swap edge commutator: with parity pending, the last edge
 * comm parks the parity's two edge slots into the swapped arrangement the
 * parity alg later restores, instead of finishing them cleanly. Detected by
 * effect rather than by a fixed slot, so an alternate pseudo-swap (any pair
 * the parity alg swaps, not just UF/UR) is recognized — driven, as the
 * solver expects, by what the parity alg actually did.
 */
function markPseudoSwaps(steps: ReconstructionStep[], states: CubeState[]) {
  const parityIdx = steps.findIndex(
    (s) => s.primitive && (s.primitive.type === "parity" || s.primitive.type === "ltct"),
  );
  if (parityIdx < 0) return;
  const parity = steps[parityIdx].primitive as Extract<Primitive, { type: "parity" | "ltct" }>;
  const paritySlots = parity.edgeSwap.map((r) => r.slot);
  const goal = invertTransform(stepEffect(steps[parityIdx], states));
  for (let i = parityIdx - 1; i >= 0; i--) {
    const p = steps[i].primitive;
    if (!p || p.type !== "edgeComm") continue;
    // the last edge comm: after it, the parity slots should sit in their
    // pending (matches the pre-parity goal) but not-yet-home arrangement
    const after = states[steps[i].endIdx + 1];
    const parksForParity = paritySlots.some(
      (s) => after.ep[s] === goal.ep[s] && after.eo[s] === goal.eo[s] && after.ep[s] !== s,
    );
    if (parksForParity || paritySlots.includes(p.targets[1].slot)) p.pseudoSwap = true;
    break;
  }
}
