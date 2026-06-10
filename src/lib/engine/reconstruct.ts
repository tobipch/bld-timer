import {
  applyMove,
  diffStates,
  isSolved,
  solvedState,
  statesEqual,
  type CubeState,
  type OuterMove,
} from "../cube/state";
import { classifyDiff, unsolvedSummary, type BufferRefs, type Primitive } from "./classify";

export interface TimedMove {
  move: OuterMove;
  /** milliseconds, monotonic within a solve (cube timestamp preferred) */
  t: number;
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
}

export interface MistakeDiagnosis {
  kind: "missing-case" | "inverted-case" | "small-mistake";
  /** missing/inverted: the primitive that is left to solve */
  missing?: Primitive;
  /** inverted: index of the executed step that looks like the inverse */
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
  diagnosis: MistakeDiagnosis | null;
}

/** Longest segment we try to explain as a single case. */
const MAX_SEGMENT = 32;

/** An inter-move pause above this marks a likely boundary between cases. */
const DEFAULT_GAP_MS = 350;

interface DpEntry {
  unexplained: number;
  /** big time gaps swallowed inside explained segments */
  gaps: number;
  segments: number;
  prev: number;
  prim: Primitive | null; // null marks a single unknown move
}

function better(a: DpEntry, b: DpEntry): boolean {
  if (a.unexplained !== b.unexplained) return a.unexplained < b.unexplained;
  if (a.gaps !== b.gaps) return a.gaps < b.gaps;
  return a.segments < b.segments;
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
  dp[0] = { unexplained: 0, gaps: 0, segments: 0, prev: -1, prim: null };
  for (let i = 1; i <= n; i++) {
    // fallback: previous best plus one unexplained move
    let best: DpEntry = {
      unexplained: dp[i - 1].unexplained + 1,
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

  const finalState = states[n];
  const solved = isSolved(finalState);
  let leftover: Reconstruction["leftover"] = null;
  let brokenFromIdx: number | null = null;
  let diagnosis: MistakeDiagnosis | null = null;
  if (!solved) {
    leftover = unsolvedSummary(diffStates(finalState, solvedState()));
    let lastExplainedEnd = -1;
    for (const s of steps) if (s.kind !== "unknown") lastExplainedEnd = s.endIdx;
    brokenFromIdx = lastExplainedEnd + 1;
    if (diagnose) {
      diagnosis = diagnoseMistake(states, timedMoves, steps, buffers, gapMs);
    }
  }

  return { steps, solved, leftover, brokenFromIdx, totalMoves: n, diagnosis };
}

const ALL_MOVES: OuterMove[] = (["U", "D", "L", "R", "F", "B"] as const).flatMap((face) =>
  ([1, 2, 3] as const).map((amount) => ({ face, amount })),
);

const sameMove = (a: OuterMove, b: OuterMove) => a.face === b.face && a.amount === b.amount;

/** How far from the start of an unknown block we look for the mistake. */
const EDIT_WINDOW = 16;

/**
 * Explain why the solve didn't resolve.
 *
 * 1. With an unexplained block: hypothesis-search single-move edits (a move
 *    deleted, replaced or inserted) near the block start, and accept a
 *    hypothesis only if the entire remainder then parses cleanly — that
 *    pinpoints the exact move and shows that the rest was right.
 * 2. With everything parsed but pieces left: if the leftover is exactly one
 *    primitive, a cycle was skipped — and if an executed step has the same
 *    state effect, that step was the inverse of what was needed.
 */
function diagnoseMistake(
  states: CubeState[],
  timedMoves: TimedMove[],
  steps: ReconstructionStep[],
  buffers: BufferRefs,
  gapMs: number,
): MistakeDiagnosis | null {
  const firstUnknown = steps.find((s) => s.kind === "unknown");
  if (firstUnknown) {
    const small = diagnoseSmallMistake(states, timedMoves, firstUnknown.startIdx, buffers, gapMs);
    if (small) return small;
  }

  const finalState = states[states.length - 1];
  const leftoverDiff = diffStates(finalState, solvedState());
  const missing = classifyDiff(leftoverDiff, buffers);
  if (missing && missing.type !== "noop") {
    // executing C' instead of C leaves exactly C''s cycle as residue, and a
    // step that classified as the leftover's inverse-effect shares its case
    if (missing.type === "cornerComm" || missing.type === "edgeComm") {
      const slotsOf = (p: Extract<Primitive, { type: "cornerComm" | "edgeComm" }>) =>
        [p.buffer.slot, ...p.targets.map((t) => t.slot)].sort().join(",");
      for (let i = 0; i < steps.length; i++) {
        const p = steps[i].primitive;
        if (!p || p.type !== missing.type) continue;
        if (slotsOf(p) === slotsOf(missing)) {
          return { kind: "inverted-case", missing, invertedStepIdx: i };
        }
      }
    }
    return { kind: "missing-case", missing };
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
