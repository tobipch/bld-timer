import {
  formatToken,
  invertOuterMoves,
  parseAlg,
  simplifyOuterMoves,
  tokensToOuterMoves,
  type AlgToken,
} from "../cube/alg";
import type { OuterMove } from "../cube/state";

/**
 * Scramble follow-along (ltct-trainer style): track progress through the
 * scramble as the cube reports moves, with wrong moves accumulating into a
 * correction list that must be undone.
 *
 * The scramble is displayed as its original tokens (incl. wide moves for
 * 3BLD orientation), but matched against the outer moves the smart cube
 * actually reports.
 */

export type TokenStatus = "done" | "current" | "pending";

export interface FollowDisplay {
  tokens: { text: string; status: TokenStatus }[];
  /** moves needed to get back on track, empty when on track */
  corrections: string[];
  /** a half-turn in progress (first quarter done) — not an error */
  partial: boolean;
  done: boolean;
}

function sameMove(a: OuterMove, b: OuterMove): boolean {
  return a.face === b.face && a.amount === b.amount;
}

export class ScrambleFollower {
  readonly tokens: AlgToken[];
  readonly expected: OuterMove[];
  private readonly tokenOf: number[];
  private pointer = 0;
  private deviation: OuterMove[] = [];

  constructor(scramble: string) {
    this.tokens = parseAlg(scramble);
    const { moves, tokenOf } = tokensToOuterMoves(this.tokens);
    this.expected = moves;
    this.tokenOf = tokenOf;
  }

  onMove(m: OuterMove): void {
    const tentative = simplifyOuterMoves([...this.deviation, m]);
    if (tentative.length === 0) {
      this.deviation = [];
      return;
    }
    if (
      tentative.length === 1 &&
      this.pointer < this.expected.length &&
      sameMove(tentative[0], this.expected[this.pointer])
    ) {
      this.pointer++;
      this.deviation = [];
      return;
    }
    this.deviation = tentative;
  }

  get isDone(): boolean {
    return this.pointer === this.expected.length && this.deviation.length === 0;
  }

  get offTrack(): boolean {
    return this.deviation.length > 0 && !this.isPartial();
  }

  private isPartial(): boolean {
    return (
      this.deviation.length === 1 &&
      this.pointer < this.expected.length &&
      this.deviation[0].face === this.expected[this.pointer].face
    );
  }

  display(): FollowDisplay {
    const doneMoves = this.pointer;
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
        status = "current";
      } else {
        status = "pending";
      }
      return { text: formatToken(t), status };
    });
    const partial = this.isPartial();
    const corrections = partial
      ? []
      : invertOuterMoves(this.deviation).map((m) => m.face + (m.amount === 2 ? "2" : m.amount === 3 ? "'" : ""));
    return { tokens, corrections, partial, done: this.isDone };
  }
}
