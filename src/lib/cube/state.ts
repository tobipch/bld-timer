import { MOVE_STEPS, type Face, type PermStep } from "./geometry";

/**
 * Cube state in the core (center-fixed) frame.
 * cp[slot] = piece currently in slot (pieces are named by their home slot);
 * co[slot] = orientation of that piece (piece sticker i sits at slot sticker
 * (i + co) mod 3); ep/eo analogous for edges (mod 2).
 */
export interface CubeState {
  cp: number[];
  co: number[];
  ep: number[];
  eo: number[];
}

export interface OuterMove {
  face: Face;
  /** 1 = clockwise quarter, 2 = half, 3 = counter-clockwise quarter. */
  amount: 1 | 2 | 3;
}

export function solvedState(): CubeState {
  return {
    cp: [0, 1, 2, 3, 4, 5, 6, 7],
    co: [0, 0, 0, 0, 0, 0, 0, 0],
    ep: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  };
}

export function cloneState(s: CubeState): CubeState {
  return { cp: [...s.cp], co: [...s.co], ep: [...s.ep], eo: [...s.eo] };
}

export function applyStep(s: CubeState, step: PermStep): CubeState {
  const cp = new Array<number>(8);
  const co = new Array<number>(8);
  const ep = new Array<number>(12);
  const eo = new Array<number>(12);
  for (let i = 0; i < 8; i++) {
    cp[i] = s.cp[step.cornerSrc[i]];
    co[i] = (s.co[step.cornerSrc[i]] + step.cornerDelta[i]) % 3;
  }
  for (let i = 0; i < 12; i++) {
    ep[i] = s.ep[step.edgeSrc[i]];
    eo[i] = (s.eo[step.edgeSrc[i]] + step.edgeDelta[i]) % 2;
  }
  return { cp, co, ep, eo };
}

export function applyMove(s: CubeState, move: OuterMove): CubeState {
  let out = s;
  for (let i = 0; i < move.amount; i++) out = applyStep(out, MOVE_STEPS[move.face]);
  return out;
}

export function applyMoves(s: CubeState, moves: OuterMove[]): CubeState {
  let out = s;
  for (const m of moves) out = applyMove(out, m);
  return out;
}

export function statesEqual(a: CubeState, b: CubeState): boolean {
  for (let i = 0; i < 8; i++) if (a.cp[i] !== b.cp[i] || a.co[i] !== b.co[i]) return false;
  for (let i = 0; i < 12; i++) if (a.ep[i] !== b.ep[i] || a.eo[i] !== b.eo[i]) return false;
  return true;
}

/**
 * Solved means every piece home and oriented, relative to the centers.
 * Whole-cube orientation is irrelevant by construction of the core frame.
 */
export function isSolved(s: CubeState): boolean {
  return statesEqual(s, SOLVED);
}

const SOLVED = solvedState();

/**
 * The transformation performed between state `a` and the later state `b`,
 * expressed in slot space: content of slot u moved to slot v=goesTo, picking
 * up `twist`/`flip` orientation. This is independent of the scramble — a
 * commutator produces the same diff wherever it is executed.
 *
 * cornerSrc[v] = u (slot v's content came from slot u);
 * cornerTwist[v] = orientation added on the way.
 */
export interface StateDiff {
  cornerSrc: number[];
  cornerTwist: number[];
  edgeSrc: number[];
  edgeFlip: number[];
}

export function diffStates(a: CubeState, b: CubeState): StateDiff {
  // Where is piece p in a? slotOfPieceA[p]
  const cornerSlotA = new Array<number>(8);
  const edgeSlotA = new Array<number>(12);
  for (let i = 0; i < 8; i++) cornerSlotA[a.cp[i]] = i;
  for (let i = 0; i < 12; i++) edgeSlotA[a.ep[i]] = i;

  const cornerSrc = new Array<number>(8);
  const cornerTwist = new Array<number>(8);
  for (let v = 0; v < 8; v++) {
    const u = cornerSlotA[b.cp[v]];
    cornerSrc[v] = u;
    cornerTwist[v] = (b.co[v] - a.co[u] + 3) % 3;
  }
  const edgeSrc = new Array<number>(12);
  const edgeFlip = new Array<number>(12);
  for (let v = 0; v < 12; v++) {
    const u = edgeSlotA[b.ep[v]];
    edgeSrc[v] = u;
    edgeFlip[v] = (b.eo[v] - a.eo[u] + 2) % 2;
  }
  return { cornerSrc, cornerTwist, edgeSrc, edgeFlip };
}

/*
 * Transformations: a CubeState can also be read as "what a move sequence
 * does", i.e. the state it produces from solved. Diffs are position-
 * independent, so these compose like group elements — which lets the
 * diagnosis solve for "what should this step have been".
 */

/** The transformation performed between state a and the later state b. */
export function transformBetween(a: CubeState, b: CubeState): CubeState {
  const d = diffStates(a, b);
  return { cp: d.cornerSrc, co: d.cornerTwist, ep: d.edgeSrc, eo: d.edgeFlip };
}

/** Apply transformation a, then b. */
export function composeTransforms(a: CubeState, b: CubeState): CubeState {
  const cp = new Array<number>(8);
  const co = new Array<number>(8);
  const ep = new Array<number>(12);
  const eo = new Array<number>(12);
  for (let v = 0; v < 8; v++) {
    cp[v] = a.cp[b.cp[v]];
    co[v] = (a.co[b.cp[v]] + b.co[v]) % 3;
  }
  for (let v = 0; v < 12; v++) {
    ep[v] = a.ep[b.ep[v]];
    eo[v] = (a.eo[b.ep[v]] + b.eo[v]) % 2;
  }
  return { cp, co, ep, eo };
}

export function invertTransform(s: CubeState): CubeState {
  const cp = new Array<number>(8);
  const co = new Array<number>(8);
  const ep = new Array<number>(12);
  const eo = new Array<number>(12);
  for (let v = 0; v < 8; v++) {
    cp[s.cp[v]] = v;
    co[s.cp[v]] = (3 - s.co[v]) % 3;
  }
  for (let v = 0; v < 12; v++) {
    ep[s.ep[v]] = v;
    eo[s.ep[v]] = s.eo[v]; // flips are self-inverse
  }
  return { cp, co, ep, eo };
}
