import {
  formatToken,
  invertOuterMoves,
  parseAlg,
  tokensToOuterMoves,
  type AlgToken,
} from "../cube/alg";
import { applyMove, solvedState, statesEqual, type CubeState, type OuterMove } from "../cube/state";
import type { Face } from "../cube/geometry";

/**
 * Scramble follow-along (ltct-trainer style): track progress through the
 * scramble as the cube reports moves, with wrong moves accumulating into a
 * correction list that must be undone.
 *
 * The scramble is displayed as its original tokens (incl. wide moves for
 * 3BLD orientation), but matched against the outer moves the smart cube
 * actually reports.
 */

export type TokenStatus = "done" | "current" | "partial" | "pending";

export interface FollowDisplay {
  tokens: { text: string; status: TokenStatus }[];
  /** moves needed to get back on track, empty when on track */
  corrections: string[];
  /** a half-turn in progress (first quarter done) — not an error */
  partial: boolean;
  done: boolean;
}

const AXIS: Record<Face, number> = { U: 0, D: 0, L: 1, R: 1, F: 2, B: 2 };

/**
 * Merge moves treating opposite faces as commuting: within a run of moves on
 * one axis, same-face turns combine regardless of order (U D U2 D' U' -> U' D...
 * collapses to its net effect).
 */
function simplifyAxisMoves(moves: OuterMove[]): OuterMove[] {
  const out: OuterMove[] = [];
  for (const m of moves) {
    let merged = false;
    for (let i = out.length - 1; i >= 0; i--) {
      if (AXIS[out[i].face] !== AXIS[m.face]) break;
      if (out[i].face === m.face) {
        const a = (out[i].amount + m.amount) % 4;
        if (a === 0) out.splice(i, 1);
        else out[i].amount = a as 1 | 2 | 3;
        merged = true;
        break;
      }
    }
    if (!merged) out.push({ ...m });
  }
  return out;
}

export class ScrambleFollower {
  readonly tokens: AlgToken[];
  readonly expected: OuterMove[];
  private readonly tokenOf: number[];
  /** cube state after each expected move; the cube starts solved */
  private readonly waypoints: CubeState[];
  private current: CubeState = solvedState();
  private pointer = 0;
  private deviation: OuterMove[] = [];

  constructor(scramble: string) {
    this.tokens = parseAlg(scramble);
    const { moves, tokenOf } = tokensToOuterMoves(this.tokens);
    this.expected = moves;
    this.tokenOf = tokenOf;
    this.waypoints = [solvedState()];
    for (const m of moves) {
      this.waypoints.push(applyMove(this.waypoints[this.waypoints.length - 1], m));
    }
  }

  /**
   * Progress is judged by state, not by move history: whatever path the
   * cube takes, the moment it reaches a state along the scramble we snap to
   * that point (preferring the furthest). The deviation list only feeds the
   * corrections display.
   */
  onMove(m: OuterMove): void {
    this.current = applyMove(this.current, m);
    for (let p = this.waypoints.length - 1; p >= 0; p--) {
      if (statesEqual(this.current, this.waypoints[p])) {
        this.pointer = p;
        this.deviation = [];
        return;
      }
    }
    this.deviation = simplifyAxisMoves([...this.deviation, m]);
  }

  get isDone(): boolean {
    return this.pointer === this.expected.length && this.deviation.length === 0;
  }

  get offTrack(): boolean {
    return this.deviation.length > 0 && !this.isPartial();
  }

  /**
   * A half-turn in progress: a single quarter turn on the face of an
   * expected double turn counts as halfway (either direction works, since
   * D D and D' D' both complete a D2). Anything else on that face is a
   * wrong turn, not a partial.
   */
  private isPartial(): boolean {
    if (this.deviation.length !== 1 || this.pointer >= this.expected.length) return false;
    const expected = this.expected[this.pointer];
    const dev = this.deviation[0];
    return dev.face === expected.face && expected.amount === 2 && dev.amount !== 2;
  }

  display(): FollowDisplay {
    const doneMoves = this.pointer;
    const partial = this.isPartial();
    const tokens = this.tokens.map((t, i) => {
      const span = this.tokenOf
        .map((tok, mi) => ({ tok, mi }))
        .filter((e) => e.tok === i);
      let status: TokenStatus;
      if (span.length === 0) {
        // rotations emit no moves; done once everything before them is done
        const before = this.tokenOf.filter((tok) => tok < i).length;
        status = doneMoves >= before ? "done" : "pending";
      } else if (span.every((e) => e.mi < doneMoves)) {
        status = "done";
      } else if (span.some((e) => e.mi === doneMoves)) {
        status = partial ? "partial" : "current";
      } else {
        status = "pending";
      }
      return { text: formatToken(t), status };
    });
    const corrections = partial
      ? []
      : invertOuterMoves(this.deviation).map((m) => m.face + (m.amount === 2 ? "2" : m.amount === 3 ? "'" : ""));
    return { tokens, corrections, partial, done: this.isDone };
  }
}
