import {
  identityFrame,
  parseAlg,
  rotateFrame,
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

function foldAndTranslate(moves: OuterMove[], orientation: string): HumanToken[] {
  let frame = orientationFrame(orientation); // logical (user) -> core
  const out: HumanToken[] = [];
  const work = moves.map((m) => ({ ...m }));
  let i = 0;
  while (i < work.length) {
    const cur = work[i];
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
        out.push({ kind: "slice", base: slice.base, amount: slice.amount });
        const def = SLICE_DEF[slice.base];
        const signed = slice.amount === 3 ? -1 : slice.amount;
        frame = rotateFrame(frame, def.rot, def.rotAmount * signed);
        work.splice(partner, 1);
        work.splice(i, 1);
        continue;
      }
    }
    out.push({ kind: "outer", base: invertMap(frame)[cur.face], amount: cur.amount });
    i++;
  }
  return out;
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

function factorOrJoin(tokens: HumanToken[]): string {
  // the unsplit sequence is the faithful record; prefer it when it factors
  const direct = tryFactor(tokens);
  if (direct) return direct.text;
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
  return best ? best.text : join(tokens);
}

/** Human-readable alg for a recorded core-frame move sequence. */
export function humanizeMoves(moves: OuterMove[], orientation: string): string {
  if (moves.length === 0) return "";
  return factorOrJoin(simplifyTokens(foldAndTranslate(moves, orientation)));
}
