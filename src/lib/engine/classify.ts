import {
  cornerStickerByName,
  cornerStickerName,
  CORNER_SLOTS,
  edgeStickerByName,
  edgeStickerName,
  EDGE_SLOTS,
} from "../cube/geometry";
import type { StateDiff } from "../cube/state";

/**
 * Classification of a state diff into the BLD primitives:
 *
 *   edge/corner commutator  – one clean 3-cycle, nothing else
 *   parity                  – one corner 2-swap + one edge 2-swap
 *   ltct                    – parity + exactly one corner twisted in place
 *   flip                    – 2 edges flipped in place
 *   twist                   – 2 or 3 corners twisted in place
 *   noop                    – nothing changed
 *
 * Targets are reported sticker-level: where the buffer sticker's content
 * went, exactly the letter the solver memorized. All sticker refs are in the
 * intrinsic (core) frame; presentation maps them into the user's frame.
 */

export interface StickerRef {
  kind: "corner" | "edge";
  slot: number;
  sticker: number;
}

export function refName(ref: StickerRef): string {
  return ref.kind === "corner"
    ? cornerStickerName(ref.slot, ref.sticker)
    : edgeStickerName(ref.slot, ref.sticker);
}

export type Primitive =
  | { type: "noop" }
  | {
      type: "cornerComm" | "edgeComm";
      buffer: StickerRef;
      targets: [StickerRef, StickerRef];
      /** true when no configured buffer was part of the cycle */
      nonStandardBuffer: boolean;
      /** pseudo-swap parity prep: filled in by the reconstructor */
      pseudoSwap?: boolean;
    }
  | {
      type: "parity";
      cornerBuffer: StickerRef;
      cornerTarget: StickerRef;
      edgeSwap: [StickerRef, StickerRef];
    }
  | {
      type: "ltct";
      cornerBuffer: StickerRef;
      cornerTarget: StickerRef;
      edgeSwap: [StickerRef, StickerRef];
      /** sticker where the twisted piece's U/D facelet sat before the alg */
      twisted: StickerRef;
      twistDir: "cw" | "ccw";
    }
  | { type: "flip"; edges: [StickerRef, StickerRef] }
  | {
      type: "twist";
      /** for each corner: sticker where its U/D facelet sat before the alg */
      corners: { sticker: StickerRef; dir: "cw" | "ccw" }[];
    };

export interface BufferRefs {
  /** corner buffer stickers in priority order, intrinsic frame */
  corners: StickerRef[];
  /** edge buffer stickers in priority order, intrinsic frame */
  edges: StickerRef[];
}

export function buffersFromNames(cornerNames: string[], edgeNames: string[]): BufferRefs {
  const corners: StickerRef[] = [];
  for (const n of cornerNames) {
    const r = cornerStickerByName(n);
    if (r) corners.push({ kind: "corner", ...r });
  }
  const edges: StickerRef[] = [];
  for (const n of edgeNames) {
    const r = edgeStickerByName(n);
    if (r) edges.push({ kind: "edge", ...r });
  }
  return { corners, edges };
}

interface OrbitShape {
  /** slots whose content came from another slot */
  moved: number[];
  /** goesTo[u] = v: content of slot u moved to slot v */
  goesTo: number[];
  /** slots with content in place but reoriented */
  twistedInPlace: number[];
  /** cycles over moved slots, each as [s, goesTo[s], ...] */
  cycles: number[][];
}

function orbitShape(src: number[], ori: number[]): OrbitShape {
  const n = src.length;
  const goesTo = new Array<number>(n);
  for (let v = 0; v < n; v++) goesTo[src[v]] = v;
  const moved: number[] = [];
  const twistedInPlace: number[] = [];
  for (let s = 0; s < n; s++) {
    if (src[s] !== s) moved.push(s);
    else if (ori[s] !== 0) twistedInPlace.push(s);
  }
  const seen = new Set<number>();
  const cycles: number[][] = [];
  for (const s of moved) {
    if (seen.has(s)) continue;
    const cyc: number[] = [];
    let cur = s;
    do {
      cyc.push(cur);
      seen.add(cur);
      cur = goesTo[cur];
    } while (cur !== s);
    cycles.push(cyc);
  }
  return { moved, goesTo, twistedInPlace, cycles };
}

const dirOf = (delta: number, mod: number): "cw" | "ccw" => (delta === 1 ? "cw" : "ccw");

/** Sticker showing the piece's reference (U/D) facelet for a piece twisted by `pre`. */
function preTwistSticker(slot: number, algDelta: number): { ref: StickerRef; dir: "cw" | "ccw" } {
  // The alg added algDelta, so the piece was twisted by -algDelta before.
  const pre = (3 - algDelta) % 3;
  return {
    ref: { kind: "corner", slot, sticker: pre },
    dir: dirOf(pre, 3),
  };
}

function pickBuffer(prio: StickerRef[], cycleSlots: number[], kind: "corner" | "edge"): {
  buffer: StickerRef;
  nonStandard: boolean;
} {
  for (const b of prio) {
    if (cycleSlots.includes(b.slot)) return { buffer: b, nonStandard: false };
  }
  return { buffer: { kind, slot: cycleSlots[0], sticker: 0 }, nonStandard: true };
}

/** Follow the buffer sticker through a cycle to produce sticker-level targets. */
function cycleTargets(
  buffer: StickerRef,
  goesTo: number[],
  ori: number[],
  count: number,
  mod: number,
  kind: "corner" | "edge",
): StickerRef[] {
  const out: StickerRef[] = [];
  let slot = buffer.slot;
  let sticker = buffer.sticker;
  for (let i = 0; i < count; i++) {
    const next = goesTo[slot];
    sticker = (sticker + ori[next]) % mod;
    slot = next;
    out.push({ kind, slot, sticker });
  }
  return out;
}

export function classifyDiff(diff: StateDiff, buffers: BufferRefs): Primitive | null {
  const c = orbitShape(diff.cornerSrc, diff.cornerTwist);
  const e = orbitShape(diff.edgeSrc, diff.edgeFlip);

  const cornersClean = c.moved.length === 0 && c.twistedInPlace.length === 0;
  const edgesClean = e.moved.length === 0 && e.twistedInPlace.length === 0;

  if (cornersClean && edgesClean) return { type: "noop" };

  // corner commutator: one corner 3-cycle, edges untouched
  if (c.cycles.length === 1 && c.moved.length === 3 && c.twistedInPlace.length === 0 && edgesClean) {
    const { buffer, nonStandard } = pickBuffer(buffers.corners, c.cycles[0], "corner");
    const [t1, t2] = cycleTargets(buffer, c.goesTo, diff.cornerTwist, 2, 3, "corner");
    return { type: "cornerComm", buffer, targets: [t1, t2], nonStandardBuffer: nonStandard };
  }

  // edge commutator: one edge 3-cycle, corners untouched
  if (e.cycles.length === 1 && e.moved.length === 3 && e.twistedInPlace.length === 0 && cornersClean) {
    const { buffer, nonStandard } = pickBuffer(buffers.edges, e.cycles[0], "edge");
    const [t1, t2] = cycleTargets(buffer, e.goesTo, diff.edgeFlip, 2, 2, "edge");
    return { type: "edgeComm", buffer, targets: [t1, t2], nonStandardBuffer: nonStandard };
  }

  // flips: only edge orientations changed
  if (cornersClean && e.moved.length === 0 && e.twistedInPlace.length === 2) {
    const [a, b] = e.twistedInPlace;
    return {
      type: "flip",
      edges: [
        { kind: "edge", slot: a, sticker: 0 },
        { kind: "edge", slot: b, sticker: 0 },
      ],
    };
  }

  // twists: only corner orientations changed, 2 or 3 corners
  if (
    edgesClean &&
    c.moved.length === 0 &&
    (c.twistedInPlace.length === 2 || c.twistedInPlace.length === 3)
  ) {
    return {
      type: "twist",
      corners: c.twistedInPlace.map((s) => {
        const { ref, dir } = preTwistSticker(s, diff.cornerTwist[s]);
        return { sticker: ref, dir };
      }),
    };
  }

  // parity / LTCT: one corner 2-swap + one edge 2-swap
  const cornerSwap =
    c.cycles.length === 1 && c.moved.length === 2 && c.twistedInPlace.length <= 1;
  const edgeSwap = e.cycles.length === 1 && e.moved.length === 2 && e.twistedInPlace.length === 0;
  if (cornerSwap && edgeSwap) {
    const { buffer: cb } = pickBuffer(buffers.corners, c.cycles[0], "corner");
    const [ct] = cycleTargets(cb, c.goesTo, diff.cornerTwist, 1, 3, "corner");
    const { buffer: eb } = pickBuffer(buffers.edges, e.cycles[0], "edge");
    const [et] = cycleTargets(eb, e.goesTo, diff.edgeFlip, 1, 2, "edge");
    const swap: [StickerRef, StickerRef] = [eb, et];

    if (c.twistedInPlace.length === 1) {
      const w = c.twistedInPlace[0];
      const { ref, dir } = preTwistSticker(w, diff.cornerTwist[w]);
      return {
        type: "ltct",
        cornerBuffer: cb,
        cornerTarget: ct,
        edgeSwap: swap,
        twisted: ref,
        twistDir: dir,
      };
    }
    return { type: "parity", cornerBuffer: cb, cornerTarget: ct, edgeSwap: swap };
  }

  return null;
}

/** Human-readable slot names for an unsolved-state summary. */
export function unsolvedSummary(diff: StateDiff): { corners: string[]; edges: string[] } {
  const c = orbitShape(diff.cornerSrc, diff.cornerTwist);
  const e = orbitShape(diff.edgeSrc, diff.edgeFlip);
  return {
    corners: [...c.moved, ...c.twistedInPlace].map((s) => CORNER_SLOTS[s]),
    edges: [...e.moved, ...e.twistedInPlace].map((s) => EDGE_SLOTS[s]),
  };
}
