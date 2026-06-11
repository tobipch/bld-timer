import {
  identityFrame,
  parseAlg,
  rotateFrame,
  simplifyOuterMoves,
  SLICE_DEF,
  type FaceMap,
} from "./alg";
import type { Face } from "./geometry";
import type { OuterMove } from "./state";

/**
 * Turn the raw outer moves a smart cube reports into the alg the user
 * actually performed:
 *
 * 1. Fold opposite-face pairs back into slice moves (a physical M arrives
 *    as R + L' with the core shifted) and track the resulting frame shift.
 * 2. Translate every face through the user's orientation setting (someone
 *    holding z2 turns their "U" on the core's D face).
 * 3. Factor the token sequence into commutator/conjugate notation
 *    ([setup: [A, B]]) when it has that structure.
 *
 * Display-only: stored data stays in raw core-frame outer moves.
 */

interface HumanToken {
  kind: "outer" | "slice";
  base: string; // face letter or M/E/S
  amount: number; // 1..3
}

const OPPOSITE: Record<Face, Face> = { U: "D", D: "U", L: "R", R: "L", F: "B", B: "F" };

function invertMap(m: FaceMap): Record<Face, Face> {
  const out = {} as Record<Face, Face>;
  for (const f of Object.keys(m) as Face[]) out[m[f]] = f;
  return out;
}

function orientationFrame(orientation: string): FaceMap {
  let frame = identityFrame();
  const trimmed = orientation.trim();
  if (!trimmed) return frame;
  try {
    for (const t of parseAlg(trimmed)) {
      if (t.kind === "rotation") frame = rotateFrame(frame, t.base as "x" | "y" | "z", t.amount);
    }
  } catch {
    // invalid orientation: fall back to identity
  }
  return frame;
}

/**
 * Which slice does the logical pair (l1^p, opposite^-p) represent?
 * Derived from SLICE_DEF: M emits R^s L^-s, E emits U^s D^-s, S emits F^-s B^s.
 */
function sliceFor(l1: Face, p: number): { base: "M" | "E" | "S"; amount: number } | null {
  switch (l1) {
    case "R":
      return { base: "M", amount: p };
    case "L":
      return { base: "M", amount: (4 - p) % 4 };
    case "U":
      return { base: "E", amount: p };
    case "D":
      return { base: "E", amount: (4 - p) % 4 };
    case "B":
      return { base: "S", amount: p };
    case "F":
      return { base: "S", amount: (4 - p) % 4 };
    default:
      return null;
  }
}

/**
 * All ways of reading the move stream: at each point where an opposite-face
 * pair could be a slice, both the folded and unfolded readings are explored
 * (an adjacent U D' in a corner comm is usually two moves, not an E — and a
 * wrong fold shifts the frame for everything after it). The caller picks
 * the reading that factors into commutator notation.
 */
function foldVariants(moves: OuterMove[], orientation: string, cap = 64): HumanToken[][] {
  const startFrame = orientationFrame(orientation); // logical (user) -> core
  const results: HumanToken[][] = [];
  const seen = new Set<string>();

  function go(work: OuterMove[], i: number, frame: FaceMap, acc: HumanToken[]) {
    if (results.length >= cap) return;
    if (i >= work.length) {
      const key = acc.map(fmt).join(" ");
      if (!seen.has(key)) {
        seen.add(key);
        results.push(acc);
      }
      return;
    }
    const cur = work[i];
    // a sloppy turn can split one layer event in two (F2 F' instead of F):
    // merging adjacent same-face turns is explored as its own branch, since
    // either reading can be the one that folds/factors
    if (i + 1 < work.length && work[i + 1].face === cur.face) {
      const sum = (cur.amount + work[i + 1].amount) % 4;
      const mergedWork = work.slice();
      mergedWork.splice(i, 2, ...(sum === 0 ? [] : [{ face: cur.face, amount: sum as 1 | 2 | 3 }]));
      go(mergedWork, i, frame, acc);
    }
    // find the slice partner: the complementary opposite-face turn, allowing
    // one same-axis move in between (M2 may arrive as R R L' L' — moves on
    // the same axis commute, so the pair can be pulled together)
    let partner = -1;
    for (let j = i + 1; j <= Math.min(i + 2, work.length - 1); j++) {
      const between = work.slice(i + 1, j);
      if (!between.every((b) => b.face === cur.face || b.face === OPPOSITE[cur.face])) break;
      if (work[j].face === OPPOSITE[cur.face] && (cur.amount + work[j].amount) % 4 === 0) {
        partner = j;
        break;
      }
    }
    if (partner >= 0) {
      const inv = invertMap(frame);
      const slice = sliceFor(inv[cur.face], cur.amount);
      if (slice && slice.amount !== 0) {
        const def = SLICE_DEF[slice.base];
        const signed = slice.amount === 3 ? -1 : slice.amount;
        const folded = work.slice();
        folded.splice(partner, 1);
        folded.splice(i, 1);
        go(folded, i, rotateFrame(frame, def.rot, def.rotAmount * signed), [
          ...acc,
          { kind: "slice", base: slice.base, amount: slice.amount },
        ]);
      }
    }
    go(work, i + 1, frame, [...acc, { kind: "outer", base: invertMap(frame)[cur.face], amount: cur.amount }]);
  }

  go(
    moves.map((m) => ({ ...m })),
    0,
    startFrame,
    [],
  );
  return results;
}

/** Greedy reading (prefer folds), for verbatim display of fumbles. */
function foldAndTranslate(moves: OuterMove[], orientation: string): HumanToken[] {
  return foldVariants(moves, orientation, 1)[0] ?? [];
}

function simplifyTokens(tokens: HumanToken[]): HumanToken[] {
  const out: HumanToken[] = [];
  for (const t of tokens) {
    const last = out[out.length - 1];
    if (last && last.kind === t.kind && last.base === t.base) {
      last.amount = (last.amount + t.amount) % 4;
      if (last.amount === 0) out.pop();
    } else {
      out.push({ ...t });
    }
  }
  return out;
}

const fmt = (t: HumanToken) => t.base + (t.amount === 2 ? "2" : t.amount === 3 ? "'" : "");
const join = (ts: HumanToken[]) => ts.map(fmt).join(" ");

function inverseSeq(ts: HumanToken[]): HumanToken[] {
  return ts
    .slice()
    .reverse()
    .map((t) => ({ ...t, amount: (4 - t.amount) % 4 }));
}

function seqEq(a: HumanToken[], b: HumanToken[]): boolean {
  return a.length === b.length && a.every((t, i) => t.kind === b[i].kind && t.base === b[i].base && t.amount === b[i].amount);
}

/**
 * Try to factor as [setup: [A, B]] / [A, B]; null when no such shape.
 * Prefers the longest setup — the conventional way comms are written.
 */
function tryFactor(tokens: HumanToken[]): { setupLen: number; text: string } | null {
  const n = tokens.length;
  for (let k = Math.floor((n - 4) / 2); k >= 0; k--) {
    if (k > 0 && !seqEq(tokens.slice(n - k), inverseSeq(tokens.slice(0, k)))) continue;
    const inner = tokens.slice(k, n - k);
    const m = inner.length;
    if (m < 4 || m % 2 !== 0) continue;
    for (let a = 1; 2 * a + 2 <= m; a++) {
      if ((m - 2 * a) % 2 !== 0) continue;
      const b = (m - 2 * a) / 2;
      const A = inner.slice(0, a);
      const B = inner.slice(a, a + b);
      if (
        seqEq(inner.slice(a + b, a + b + a), inverseSeq(A)) &&
        seqEq(inner.slice(a + b + a), inverseSeq(B))
      ) {
        const comm = `[${join(A)}, ${join(B)}]`;
        return { setupLen: k, text: k > 0 ? `[${join(tokens.slice(0, k))}: ${comm}]` : comm };
      }
    }
  }
  return null;
}

function tryFactorWithSplits(tokens: HumanToken[]): { setupLen: number; text: string } | null {
  // the unsplit sequence is the faithful record; prefer it when it factors
  const direct = tryFactor(tokens);
  if (direct) return direct;
  // A cancellation at a bracket boundary merges two tokens (e.g. B' ending
  // U2 followed by a setup-undo starting U shows up as U'). Re-splitting one
  // token can recover the structure; among the possibilities prefer the
  // longest setup, tie-broken toward late split points (cancellation at the
  // closing boundary is the common case).
  let best: { setupLen: number; text: string } | null = null;
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i];
    for (let p = 1; p <= 3; p++) {
      const q = (t.amount - p + 4) % 4;
      if (q === 0) continue;
      const split = [
        ...tokens.slice(0, i),
        { ...t, amount: p },
        { ...t, amount: q },
        ...tokens.slice(i + 1),
      ];
      const cand = tryFactor(split);
      if (cand && (!best || cand.setupLen > best.setupLen)) best = cand;
    }
  }
  return best;
}

/**
 * Human-readable alg for a recorded core-frame move sequence. Commutator
 * notation is preferred above all: every slice-fold reading of the stream
 * is tried, and the one that factors wins (so a U D' inside a corner comm
 * isn't forced into an E that destroys the bracket structure). Among
 * factoring readings, more slice folds win — edge comms keep their M/E/S.
 */
export function humanizeMoves(moves: OuterMove[], orientation: string): string {
  if (moves.length === 0) return "";
  interface Cand {
    factored: boolean;
    folds: number;
    setupLen: number;
    text: string;
  }
  let best: Cand | null = null;
  for (const v of foldVariants(moves, orientation)) {
    const simplified = simplifyTokens(v);
    const folds = v.filter((t) => t.kind === "slice").length;
    const f = tryFactorWithSplits(simplified);
    const cand: Cand = f
      ? { factored: true, folds, setupLen: f.setupLen, text: f.text }
      : { factored: false, folds, setupLen: -1, text: join(simplified) };
    const better =
      !best ||
      (cand.factored !== best.factored
        ? cand.factored
        : cand.folds !== best.folds
          ? cand.folds > best.folds
          : cand.setupLen !== best.setupLen
            ? cand.setupLen > best.setupLen
            : // full tie: later variants defer folds, keeping the
              // chronological reading (U E rather than E U)
              true);
    if (better) best = cand;
  }
  return best!.text;
}

/**
 * Like humanizeMoves but without simplification or factoring — for showing
 * fumbles and error blocks verbatim, where simplifying would erase exactly
 * the moves the user wants to see (a no-op's moves cancel to nothing).
 */
export function humanizeMovesVerbatim(moves: OuterMove[], orientation: string): string {
  if (moves.length === 0) return "";
  return join(foldAndTranslate(moves, orientation));
}
