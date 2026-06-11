import type { CubeState } from "../cube/state";
import type { StickerRef } from "./classify";

/**
 * What a solver should do next from a given state with a given buffer:
 * the forced next letter pair when the buffer holds an unsolved piece, or
 * the possible cycle breaks when the buffer is solved.
 */
export type Continuation =
  | {
      kind: "pair";
      pair: [StickerRef, StickerRef];
      /** ways to absorb a remaining flip/twist into the cycle: pair, then pair */
      flipRoutes?: [StickerRef, StickerRef][][];
    }
  | { kind: "closes"; first: StickerRef; flipRoutes?: [StickerRef, StickerRef][][] }
  | { kind: "breaks"; options: [StickerRef, StickerRef][] };

/** Apply the sticker-level 3-cycle buffer -> t1 -> t2 -> buffer to a state. */
function applyPairCycle(
  state: CubeState,
  buffer: StickerRef,
  t1: StickerRef,
  t2: StickerRef,
): CubeState {
  const isCorner = buffer.kind === "corner";
  const out: CubeState = { cp: [...state.cp], co: [...state.co], ep: [...state.ep], eo: [...state.eo] };
  const perm = isCorner ? out.cp : out.ep;
  const ori = isCorner ? out.co : out.eo;
  const mod = isCorner ? 3 : 2;
  const b = buffer.slot;
  const x = t1.slot;
  const y = t2.slot;
  const d1 = (t1.sticker - buffer.sticker + mod) % mod;
  const d2 = (t2.sticker - t1.sticker + mod) % mod;
  const d3 = (buffer.sticker - t2.sticker + mod) % mod;
  const atB = { p: perm[b], o: ori[b] };
  const atX = { p: perm[x], o: ori[x] };
  const atY = { p: perm[y], o: ori[y] };
  perm[x] = atB.p;
  ori[x] = (atB.o + d1) % mod;
  perm[y] = atX.p;
  ori[y] = (atX.o + d2) % mod;
  perm[b] = atY.p;
  ori[b] = (atY.o + d3) % mod;
  return out;
}

export function continuationFor(state: CubeState, buffer: StickerRef, withFlipRoutes = true): Continuation {
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
  if (q === b) {
    const out: Continuation = { kind: "closes", first: t1 };
    if (withFlipRoutes) out.flipRoutes = flipRoutesFrom(state, buffer, t1);
    return out;
  }
  const t2: StickerRef = {
    kind: buffer.kind,
    slot: q,
    sticker: (((t1.sticker - ori[t1.slot]) % mod) + mod) % mod,
  };
  const out: Continuation = { kind: "pair", pair: [t1, t2] };
  if (withFlipRoutes) out.flipRoutes = flipRoutesFrom(state, buffer, t1);
  return out;
}

/**
 * "Breaking into flips": instead of finishing the cycle and using a long
 * flip/twist alg, route the cycle through a misoriented-in-place piece —
 * first pair goes (t1, flip sticker), then the forced continuation absorbs
 * the orientation. Verified by simulation, so the suggested letters are
 * exactly what the state requires.
 */
function flipRoutesFrom(
  state: CubeState,
  buffer: StickerRef,
  t1: StickerRef,
): [StickerRef, StickerRef][][] | undefined {
  const isCorner = buffer.kind === "corner";
  const perm = isCorner ? state.cp : state.ep;
  const ori = isCorner ? state.co : state.eo;
  const mod = isCorner ? 3 : 2;
  const count = isCorner ? 8 : 12;
  const routes: [StickerRef, StickerRef][][] = [];
  for (let x = 0; x < count; x++) {
    if (x === buffer.slot || x === t1.slot) continue;
    if (perm[x] !== x || ori[x] === 0) continue; // only misoriented in place
    for (let s = 0; s < mod; s++) {
      const entry: StickerRef = { kind: buffer.kind, slot: x, sticker: s };
      const sim = applyPairCycle(state, buffer, t1, entry);
      const next = continuationFor(sim, buffer, false);
      if (next.kind === "pair") routes.push([[t1, entry], next.pair]);
      if (routes.length >= 4) return routes;
    }
  }
  return routes.length > 0 ? routes : undefined;
}
