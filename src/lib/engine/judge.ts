import type { CubeState } from "../cube/state";
import type { Primitive, StickerRef } from "./classify";
import type { TechniqueProfile } from "./profile";
import { continuationFor, type Continuation } from "./suggest";

/**
 * Rule-driven solve checking. The user's technique profile defines, for any
 * cube state, which next actions a solver of that method may take; a step is
 * judged by membership in that set — no intent-guessing heuristics.
 *
 * Rules (per orbit method):
 * - 3-style / Orozco: a pair must start with the forced first target (the
 *   buffer content's home) or, when the buffer is home, any cycle break.
 *   The second target is the chain continuation — or a new break when the
 *   cycle closes, an entry into a misoriented-in-place piece (breaking into
 *   flips/twists), or, with parity pending and pseudo-swap enabled, a park
 *   on a currently-solved slot. Orozco additionally accepts any cycle
 *   through its helper sticker.
 * - OP: steps are swap-shaped (classified as "parity" primitives); the own
 *   orbit must swap buffer with a valid target, the other orbit's damage is
 *   free (it alternates out).
 * - M2: not judged yet (reconstruction works, checking is generic).
 */

export interface JudgeContext {
  profile: TechniqueProfile;
  /** intrinsic standard buffers (first of each configured list) */
  standardCorner: StickerRef | null;
  standardEdge: StickerRef | null;
  orozcoCornerHelper: StickerRef | null;
  orozcoEdgeHelper: StickerRef | null;
}

export interface Verdict {
  ok: boolean;
  reason?: string;
  /** what the profile allowed here, for display */
  expected?: Continuation;
}

const OK: Verdict = { ok: true };

/** Corner permutation parity of the remaining solve — odd means parity pending. */
export function parityPending(state: CubeState): boolean {
  const perm = [...state.cp];
  let swaps = 0;
  for (let i = 0; i < perm.length; i++) {
    while (perm[i] !== i) {
      const j = perm[i];
      [perm[i], perm[j]] = [perm[j], perm[i]];
      swaps++;
    }
  }
  return swaps % 2 === 1;
}

interface OrbitView {
  perm: number[];
  ori: number[];
  mod: number;
}

function orbitOf(state: CubeState, kind: "corner" | "edge"): OrbitView {
  return kind === "corner"
    ? { perm: state.cp, ori: state.co, mod: 3 }
    : { perm: state.ep, ori: state.eo, mod: 2 };
}

/** Home sticker of the content sitting at `at` (the forced next target). */
function forcedTargetFrom(view: OrbitView, at: StickerRef): StickerRef {
  const piece = view.perm[at.slot];
  return {
    kind: at.kind,
    slot: piece,
    sticker: (((at.sticker - view.ori[at.slot]) % view.mod) + view.mod) % view.mod,
  };
}

const sameSticker = (a: StickerRef, b: StickerRef) => a.slot === b.slot && a.sticker === b.sticker;

function judgePair(
  state: CubeState,
  prim: Extract<Primitive, { type: "cornerComm" | "edgeComm" }>,
  ctx: JudgeContext,
): Verdict {
  const kind = prim.type === "cornerComm" ? "corner" : "edge";
  const view = orbitOf(state, kind);
  const method = kind === "corner" ? ctx.profile.cornerMethod : ctx.profile.edgeMethod;
  if (method === "m2") return OK; // not judged yet

  const standard = kind === "corner" ? ctx.standardCorner : ctx.standardEdge;
  const buffer = prim.buffer;
  const [f1, f2] = prim.targets;

  if (!ctx.profile.floating && standard && buffer.slot !== standard.slot) {
    return {
      ok: false,
      reason: "cycle does not go through your buffer (floating buffers are disabled in your profile)",
      expected: standard ? continuationFor(state, standard) : undefined,
    };
  }

  // Orozco: any clean cycle through the helper is fine
  if (method === "orozco") {
    const helper = kind === "corner" ? ctx.orozcoCornerHelper : ctx.orozcoEdgeHelper;
    if (helper && (f1.slot === helper.slot || f2.slot === helper.slot)) return OK;
  }

  const bufferHome = view.perm[buffer.slot] === buffer.slot;
  const expected = () => continuationFor(state, buffer);

  // --- first target ---
  if (bufferHome) {
    // cycle break: any sticker of a not-yet-solved piece
    if (view.perm[f1.slot] === f1.slot && view.ori[f1.slot] === 0) {
      return { ok: false, reason: "cycle break shoots an already-solved piece", expected: expected() };
    }
  } else {
    const forced = forcedTargetFrom(view, buffer);
    if (!sameSticker(f1, forced)) {
      // alternate pseudo swap: park onto a solved slot whose piece the pair
      // sends to the buffer content's true home — the parity alg swaps the
      // two back (e.g. UB/UL parity after a UBL corner buffer)
      const altPseudo =
        ctx.profile.pseudoSwap &&
        parityPending(state) &&
        view.perm[f1.slot] === f1.slot &&
        view.ori[f1.slot] === 0 &&
        sameSticker(f2, forced);
      if (altPseudo) return OK;
      return { ok: false, reason: "first target does not match the buffer content", expected: expected() };
    }
  }

  // --- second target, given the executed first ---
  const contentAtF1 = view.perm[f1.slot];
  const closes = contentAtF1 === buffer.slot;
  if (!closes) {
    const forced2 = forcedTargetFrom(view, f1);
    if (sameSticker(f2, forced2)) return OK;
  } else {
    // cycle closed after f1: the second target opens a new cycle
    if (!(view.perm[f2.slot] === f2.slot && view.ori[f2.slot] === 0)) return OK;
  }
  // breaking into a flip/twist: route through a misoriented-in-place piece
  if (view.perm[f2.slot] === f2.slot && view.ori[f2.slot] !== 0) return OK;
  // pseudo swap: with parity pending, park the displaced piece on a solved slot
  if (
    ctx.profile.pseudoSwap &&
    parityPending(state) &&
    view.perm[f2.slot] === f2.slot &&
    view.ori[f2.slot] === 0
  ) {
    return OK;
  }
  return { ok: false, reason: "second target does not continue the cycle", expected: expected() };
}

function judgeSwap(
  state: CubeState,
  prim: Extract<Primitive, { type: "parity" | "ltct" }>,
  ctx: JudgeContext,
): Verdict {
  // For OP methods the 2c2e swap IS the working step: the own orbit must
  // swap the buffer with a valid target, the other orbit's damage is free.
  const judgeOrbit = (kind: "corner" | "edge", from: StickerRef, to: StickerRef): Verdict => {
    const view = orbitOf(state, kind);
    const standard = kind === "corner" ? ctx.standardCorner : ctx.standardEdge;
    if (standard && from.slot !== standard.slot) {
      return { ok: false, reason: "swap does not involve your buffer", expected: continuationFor(state, standard) };
    }
    if (view.perm[from.slot] === from.slot) {
      // buffer home: break — target must be unsolved
      if (view.perm[to.slot] === to.slot && view.ori[to.slot] === 0) {
        return { ok: false, reason: "cycle break shoots an already-solved piece", expected: continuationFor(state, from) };
      }
      return OK;
    }
    const forced = forcedTargetFrom(view, from);
    if (sameSticker(to, forced)) return OK;
    return { ok: false, reason: "target does not match the buffer content", expected: continuationFor(state, from) };
  };

  if (ctx.profile.cornerMethod === "op") {
    return judgeOrbit("corner", prim.cornerBuffer, prim.cornerTarget);
  }
  if (ctx.profile.edgeMethod === "op") {
    return judgeOrbit("edge", prim.edgeSwap[0], prim.edgeSwap[1]);
  }
  // 3-style/Orozco endgame parity: always acceptable
  return OK;
}

/** Judge one executed case against the profile at (counterfactual) state E. */
export function judgeStep(state: CubeState, prim: Primitive, ctx: JudgeContext): Verdict {
  switch (prim.type) {
    case "cornerComm":
    case "edgeComm":
      return judgePair(state, prim, ctx);
    case "parity":
    case "ltct":
      return judgeSwap(state, prim, ctx);
    default:
      return OK; // noop, flips, twists: always legitimate
  }
}
