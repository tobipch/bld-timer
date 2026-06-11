import type { CubeState } from "../cube/state";
import type { StickerRef } from "./classify";

/**
 * What a solver should do next from a given state with a given buffer:
 * the forced next letter pair when the buffer holds an unsolved piece, or
 * the possible cycle breaks when the buffer is solved.
 */
export type Continuation =
  | { kind: "pair"; pair: [StickerRef, StickerRef] }
  | { kind: "closes"; first: StickerRef }
  | { kind: "breaks"; options: [StickerRef, StickerRef][] };

export function continuationFor(state: CubeState, buffer: StickerRef): Continuation {
  const isCorner = buffer.kind === "corner";
  const perm = isCorner ? state.cp : state.ep;
  const ori = isCorner ? state.co : state.eo;
  const mod = isCorner ? 3 : 2;
  const count = isCorner ? 8 : 12;
  const b = buffer.slot;

  if (perm[b] === b && ori[b] === 0) {
    // buffer solved: break into any slot holding a foreign piece
    const options: [StickerRef, StickerRef][] = [];
    for (let x = 0; x < count; x++) {
      if (x === b || perm[x] === x) continue;
      const first: StickerRef = { kind: buffer.kind, slot: x, sticker: 0 };
      const q = perm[x];
      const second: StickerRef = {
        kind: buffer.kind,
        slot: q,
        sticker: (((0 - ori[x]) % mod) + mod) % mod,
      };
      options.push([first, second]);
    }
    return { kind: "breaks", options };
  }

  // forced: shoot the buffer's content home
  const p = perm[b];
  const t1: StickerRef = {
    kind: buffer.kind,
    slot: p,
    sticker: (((buffer.sticker - ori[b]) % mod) + mod) % mod,
  };
  const q = perm[t1.slot];
  if (q === b) return { kind: "closes", first: t1 };
  const t2: StickerRef = {
    kind: buffer.kind,
    slot: q,
    sticker: (((t1.sticker - ori[t1.slot]) % mod) + mod) % mod,
  };
  return { kind: "pair", pair: [t1, t2] };
}
