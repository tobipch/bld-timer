import { applyMove, isSolved, solvedState, type CubeState, type OuterMove } from "../cube/state";
import type { Face } from "../cube/geometry";
import { ScrambleFollower } from "./follow";

/**
 * The solve flow state machine. Framework-agnostic and fully testable; the
 * UI subscribes to snapshots.
 *
 *   disconnected -> scrambling -> ready -> solving -> done
 *                      ^  ^                 |          |
 *                      |  '-- turn in ready |          |
 *                awaitSolved <--------------+----------'
 *
 * There is no start key. Nothing is timed until the hands move, so the first
 * turn after the scramble is what opens the attempt — memorising takes as
 * long as it takes. The attempt only ever ends with the trigger (space),
 * never automatically, even when the cube is solved: the cube state at that
 * moment decides success or DNF.
 *
 * Four quarter turns of U or D in the same direction resets the tracking to
 * a solved cube, so a desync can be fixed on the cube itself.
 */

export type Phase = "disconnected" | "awaitSolved" | "scrambling" | "ready" | "solving" | "done";

export interface RawMove {
  move: OuterMove;
  /** wall-clock-ish local timestamp (ms), used when the cube reports none */
  tLocal: number;
  /** cube hardware timestamp (ms), the more precise clock when present */
  tCube?: number;
}

export interface SolveOutcome {
  result: "ok" | "dnf";
  /** first turn of the execution, on the local clock */
  startedAt: number;
  /** first turn to last turn; 0 for an attempt given up before turning */
  execMs: number;
  scramble: string;
  /** turns with the best clock available, as stored */
  moves: { m: OuterMove; t: number }[];
}

export interface MachineSnapshot {
  phase: Phase;
  scramble: string | null;
  follower: ScrambleFollower | null;
  firstMoveAt: number | null;
  moveCount: number;
  lastOutcome: SolveOutcome | null;
}

export class TimerMachine {
  phase: Phase = "disconnected";
  private cubeState: CubeState = solvedState();
  private follower: ScrambleFollower | null = null;
  private scramble: string | null = null;
  private pendingScramble: string | null = null;

  private firstMoveAt: number | null = null;
  private moves: RawMove[] = [];
  lastOutcome: SolveOutcome | null = null;

  private listeners = new Set<() => void>();

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }

  snapshot(): MachineSnapshot {
    return {
      phase: this.phase,
      scramble: this.scramble,
      follower: this.follower,
      firstMoveAt: this.firstMoveAt,
      moveCount: this.moves.length,
      lastOutcome: this.lastOutcome,
    };
  }

  /** Cube connected; we trust the cube to be solved (markSolved fixes desync). */
  connect() {
    this.cubeState = solvedState();
    this.phase = "scrambling";
    this.applyScrambleIfPending();
    this.emit();
  }

  disconnect() {
    this.phase = "disconnected";
    this.emit();
  }

  /**
   * Desync escape hatch: declare the cube's current physical state solved.
   * Whatever the tracking believed, we start over from here — with a fresh
   * follower, so the scramble can be applied again.
   */
  markSolved() {
    if (this.phase === "disconnected" || this.phase === "solving") {
      this.cubeState = solvedState();
      this.resetGesture = null;
      this.emit();
      return;
    }
    this.resetToSolved();
  }

  /** Back to a solved cube and a fresh scramble, dropping any attempt. */
  private resetToSolved() {
    this.cubeState = solvedState();
    this.resetGesture = null;
    this.firstMoveAt = null;
    this.moves = [];
    this.phase = "scrambling";
    this.applyScrambleIfPending();
    this.follower = this.scramble ? new ScrambleFollower(this.scramble) : null;
    this.emit();
  }

  /**
   * The reset gesture: four quarter turns of U or D in the same direction.
   * It leaves the cube exactly as it was, so it cannot be confused with
   * solving — and no scramble or alg ever contains it — which makes it a safe
   * way to say "this cube is solved" without putting the cube down.
   *
   * It stays available once an attempt has begun, but only while the gesture
   * is the whole attempt so far: four quarter turns of one face in a row
   * cancel out, so nobody's execution starts with them, while a desync that
   * was noticed a moment too late is exactly when the gesture is needed.
   */
  private resetGesture: { face: Face; amount: 1 | 2 | 3; quarters: number } | null = null;

  private isResetGesture(move: OuterMove): boolean {
    if (move.face !== "U" && move.face !== "D") {
      this.resetGesture = null;
      return false;
    }
    const g = this.resetGesture;
    if (g && g.face === move.face && g.amount === move.amount) {
      g.quarters += move.amount === 2 ? 2 : 1;
    } else {
      this.resetGesture = { face: move.face, amount: move.amount, quarters: move.amount === 2 ? 2 : 1 };
    }
    return this.resetGesture!.quarters >= 4;
  }

  /** Provide the (async-generated) scramble for the next attempt. */
  setScramble(alg: string) {
    this.pendingScramble = alg;
    if (this.phase === "scrambling" || this.phase === "done") this.applyScrambleIfPending();
    this.emit();
  }

  private applyScrambleIfPending() {
    if (this.phase !== "scrambling" || !this.pendingScramble) return;
    this.scramble = this.pendingScramble;
    this.pendingScramble = null;
    this.follower = new ScrambleFollower(this.scramble);
  }

  onCubeMove(move: OuterMove, tLocal: number, tCube?: number) {
    this.cubeState = applyMove(this.cubeState, move);
    // `moves` still holds the turns before this one, so "fewer than four" is
    // the gesture being everything the attempt consists of
    if (this.isResetGesture(move) && (this.phase !== "solving" || this.moves.length < 4)) {
      this.resetToSolved();
      return;
    }
    switch (this.phase) {
      case "scrambling": {
        this.follower?.onMove(move);
        if (this.follower?.isDone) this.phase = "ready";
        break;
      }
      case "ready": {
        // the scramble is on the cube and the hands are moving: this is the
        // execution, and its first turn is where the measurement starts
        this.firstMoveAt = tLocal;
        this.moves = [{ move, tLocal, tCube }];
        this.phase = "solving";
        break;
      }
      case "solving": {
        this.moves.push({ move, tLocal, tCube });
        break;
      }
      case "awaitSolved": {
        if (isSolved(this.cubeState)) {
          this.phase = "scrambling";
          this.applyScrambleIfPending();
        }
        break;
      }
      case "done": {
        // turning the cube after an attempt, before the next scramble is
        // shown: keep tracking, the follower starts fresh from whatever was
        // tracked (corrections will surface any mismatch)
        break;
      }
    }
    this.emit();
  }

  /** The space key: ends the attempt. */
  trigger(t: number) {
    if (this.phase === "ready") {
      // gave up before the first turn: a failed attempt with no execution
      this.finishAttempt();
      this.emit();
      return;
    }
    if (this.phase !== "solving") return;
    this.finishAttempt(t);
    this.emit();
  }

  /** Throw the attempt away — an accidental turn should not become a DNF. */
  discard() {
    if (this.phase !== "solving" && this.phase !== "ready") return;
    this.firstMoveAt = null;
    this.moves = [];
    this.scramble = null;
    this.follower = null;
    this.phase = "done";
    this.nextSolve();
  }

  private finishAttempt(endedAt?: number) {
    const solved = endedAt !== undefined && isSolved(this.cubeState);
    // the cube's own clock is the precise one, but it is all-or-nothing:
    // mixing it with the local clock would invent gaps that never happened
    const useCube = this.moves.length > 0 && this.moves.every((m) => m.tCube !== undefined);

    this.lastOutcome = {
      result: solved ? "ok" : "dnf",
      startedAt: this.firstMoveAt ?? endedAt ?? 0,
      execMs: this.moves.length > 0 ? this.moves[this.moves.length - 1].tLocal - this.moves[0].tLocal : 0,
      scramble: this.scramble ?? "",
      moves: this.moves.map((m) => ({ m: m.move, t: Math.round(useCube ? m.tCube! : m.tLocal) })),
    };
    this.firstMoveAt = null;
    this.moves = [];
    this.scramble = null;
    this.follower = null;
    this.phase = "done";
  }

  /** Move on to the next attempt; needs the cube physically solved again. */
  nextSolve() {
    if (this.phase !== "done") return;
    this.phase = isSolved(this.cubeState) ? "scrambling" : "awaitSolved";
    this.applyScrambleIfPending();
    this.emit();
  }

  get cubeIsSolved(): boolean {
    return isSolved(this.cubeState);
  }
}
