import { parseAlg } from "../cube/alg";
import {
  cornerStickerByName,
  cornerStickerName,
  edgeStickerByName,
  edgeStickerName,
  ROTATION_STEPS,
  type PermStep,
} from "../cube/geometry";
import type { LetterScheme } from "../cube/speffz";
import type { Primitive, StickerRef } from "./classify";

/**
 * Presentation of engine output in the user's frame: the orientation setting
 * (a rotation sequence like "x y", as in ltct-trainer) maps intrinsic
 * stickers to where the user sees them, and the letter scheme then names
 * them.
 */

export interface OrientationMaps {
  toUser(ref: StickerRef): StickerRef;
  cornerNameToIntrinsic(name: string): StickerRef | null;
  edgeNameToIntrinsic(name: string): StickerRef | null;
}

const composeIdentity = (): PermStep => ({
  cornerSrc: [0, 1, 2, 3, 4, 5, 6, 7],
  cornerDelta: [0, 0, 0, 0, 0, 0, 0, 0],
  edgeSrc: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  edgeDelta: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
});

function composeSteps(a: PermStep, b: PermStep): PermStep {
  // applying a then b
  return {
    cornerSrc: b.cornerSrc.map((s) => a.cornerSrc[s]),
    cornerDelta: b.cornerSrc.map((s, dst) => (a.cornerDelta[s] + b.cornerDelta[dst]) % 3),
    edgeSrc: b.edgeSrc.map((s) => a.edgeSrc[s]),
    edgeDelta: b.edgeSrc.map((s, dst) => (a.edgeDelta[s] + b.edgeDelta[dst]) % 2),
  };
}

/** Build the sticker remap for an orientation rotation sequence (may be ""). */
export function makeOrientationMaps(orientation: string): OrientationMaps {
  let step = composeIdentity();
  const trimmed = orientation.trim();
  if (trimmed.length > 0) {
    let tokens: ReturnType<typeof parseAlg>;
    try {
      tokens = parseAlg(trimmed);
    } catch {
      tokens = [];
    }
    for (const t of tokens) {
      if (t.kind !== "rotation") continue; // only rotations are meaningful here
      for (let k = 0; k < t.amount; k++) {
        step = composeSteps(step, ROTATION_STEPS[t.base as "x" | "y" | "z"]);
      }
    }
  }
  const s = step;

  function toUser(ref: StickerRef): StickerRef {
    if (ref.kind === "corner") {
      const v = s.cornerSrc.indexOf(ref.slot);
      return { kind: "corner", slot: v, sticker: (ref.sticker + s.cornerDelta[v]) % 3 };
    }
    const v = s.edgeSrc.indexOf(ref.slot);
    return { kind: "edge", slot: v, sticker: (ref.sticker + s.edgeDelta[v]) % 2 };
  }

  function fromUser(ref: StickerRef): StickerRef {
    if (ref.kind === "corner") {
      const u = s.cornerSrc[ref.slot];
      return { kind: "corner", slot: u, sticker: (ref.sticker - s.cornerDelta[ref.slot] + 3) % 3 };
    }
    const u = s.edgeSrc[ref.slot];
    return { kind: "edge", slot: u, sticker: (ref.sticker - s.edgeDelta[ref.slot] + 2) % 2 };
  }

  return {
    toUser,
    cornerNameToIntrinsic(name: string) {
      const r = cornerStickerByName(name);
      return r ? fromUser({ kind: "corner", ...r }) : null;
    },
    edgeNameToIntrinsic(name: string) {
      const r = edgeStickerByName(name);
      return r ? fromUser({ kind: "edge", ...r }) : null;
    },
  };
}

export function userStickerName(ref: StickerRef, maps: OrientationMaps): string {
  const u = maps.toUser(ref);
  return u.kind === "corner" ? cornerStickerName(u.slot, u.sticker) : edgeStickerName(u.slot, u.sticker);
}

export function letterFor(ref: StickerRef, scheme: LetterScheme, maps: OrientationMaps): string {
  const name = userStickerName(ref, maps);
  const table = ref.kind === "corner" ? scheme.corners : scheme.edges;
  return table[name] ?? name;
}

/** Stable, scheme-independent key identifying a case (intrinsic frame). */
export function caseKey(p: Primitive): string {
  const r = (ref: StickerRef) =>
    ref.kind === "corner" ? cornerStickerName(ref.slot, ref.sticker) : edgeStickerName(ref.slot, ref.sticker);
  switch (p.type) {
    case "noop":
      return "noop";
    case "cornerComm":
    case "edgeComm":
      return `${p.type}|${r(p.buffer)}|${r(p.targets[0])},${r(p.targets[1])}`;
    case "parity":
      return `parity|${r(p.cornerBuffer)}|${r(p.cornerTarget)}|${p.edgeSwap.map(r).join(",")}`;
    case "ltct":
      return `ltct|${r(p.cornerBuffer)}|${r(p.cornerTarget)}|${r(p.twisted)}`;
    case "flip":
      return `flip|${p.edges
        .map(r)
        .sort()
        .join(",")}`;
    case "twist":
      return `twist|${p.corners
        .map((c) => `${r(c.sticker)}:${c.dir}`)
        .sort()
        .join(",")}`;
  }
}

export interface StepDescription {
  /** e.g. "Edge comm", "Parity", "LTCT" */
  kind: string;
  /** e.g. "UF: JB", "UFR → A + UF↔UR", "cw P / ccw F" */
  label: string;
}

export function describePrimitive(
  p: Primitive,
  scheme: LetterScheme,
  maps: OrientationMaps,
): StepDescription {
  const L = (ref: StickerRef) => letterFor(ref, scheme, maps);
  const N = (ref: StickerRef) => userStickerName(ref, maps);
  switch (p.type) {
    case "noop":
      return { kind: "No-op", label: "cancelling moves" };
    case "edgeComm":
    case "cornerComm": {
      const kind = p.type === "edgeComm" ? "Edge comm" : "Corner comm";
      const pair = `${L(p.targets[0])}${L(p.targets[1])}`;
      const label = p.pseudoSwap
        ? `${N(p.buffer)}: ${L(p.targets[0])} (pseudo swap → ${N(p.targets[1])})`
        : `${N(p.buffer)}: ${pair}`;
      return { kind, label };
    }
    case "parity":
      return {
        kind: "Parity",
        label: `${N(p.cornerBuffer)} → ${L(p.cornerTarget)}, ${N(p.edgeSwap[0])}↔${N(p.edgeSwap[1])}`,
      };
    case "ltct":
      return {
        kind: "LTCT",
        label: `LT ${L(p.cornerTarget)}, CT ${L(p.twisted)} (${p.twistDir})`,
      };
    case "flip":
      return { kind: "Flip", label: p.edges.map((e) => N(e)).join(" & ") };
    case "twist":
      return {
        kind: p.corners.length === 3 ? "3-Twist" : "Twist",
        label: p.corners.map((c) => `${L(c.sticker)} (${c.dir})`).join(" / "),
      };
  }
}

/**
 * Plain-text description of a continuation suggestion, shared by the UI and
 * the feedback export.
 */
export function describeContinuation(
  c: import("./suggest").Continuation,
  scheme: LetterScheme,
  maps: OrientationMaps,
): string {
  const L = (r: StickerRef) => letterFor(r, scheme, maps);
  const routes =
    (c.kind === "pair" || c.kind === "closes") && c.flipRoutes?.length
      ? ` — or break into the flip: ${c.flipRoutes
          .slice(0, 2)
          .map((route) => route.map(([a, b]) => `${L(a)}${L(b)}`).join(" "))
          .join(" / ")}`
      : "";
  switch (c.kind) {
    case "pair":
      return `the state called for ${L(c.pair[0])}${L(c.pair[1])}${routes}`;
    case "closes":
      return `the state called for ${L(c.first)}, closing the cycle (then break to an unsolved piece)${routes}`;
    case "breaks": {
      const opts = c.options.slice(0, 5).map(([a, b]) => `${L(a)}${L(b)}`);
      return `the buffer was solved — a cycle break was needed, e.g. ${opts.join(", ")}${
        c.options.length > 5 ? ", …" : ""
      }`;
    }
  }
}
