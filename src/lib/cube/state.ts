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
