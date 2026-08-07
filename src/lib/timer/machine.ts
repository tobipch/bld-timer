import { applyMove, isSolved, solvedState, type CubeState, type OuterMove } from "../cube/state";
import type { Face } from "../cube/geometry";
import { reconstructSolve, type Reconstruction, type TimedMove } from "../engine/reconstruct";
import type { BufferRefs } from "../engine/classify";
import type { JudgeContext } from "../engine/judge";
import { ScrambleFollower } from "./follow";

/**
 * The solve flow state machine. Framework-agnostic and fully testable; the
 * UI subscribes to snapshots.
 *
 *   disconnected -> scrambling -> ready -> memo -> exec -> done
 *                      ^  ^                  |              |
 *                      |  '-- turn in ready  '-- space=DNF  |
 *                awaitSolved (after DNF) <-------------------'
 *
 * The solve only ever ends with the trigger (space) — never automatically,
 * even when the cube is solved.
 *
 * Four quarter turns of U or D in the same direction resets the tracking to
 * a solved cube, so a desync can be fixed on the cube itself.
 */

export type Phase = "disconnected" | "awaitSolved" | "scrambling" | "ready" | "memo" | "exec" | "done";

export interface RawMove {
  move: OuterMove;
  /** wall-clock-ish local timestamp (ms), used for phase boundaries */
  tLocal: number;
  /** cube hardware timestamp (ms), used for per-case timing when present */
  tCube?: number;
}

export interface SolveOutcome {
  result: "ok" | "dnf";
  startedAt: number;
  memoMs: number;
  execMs: number;
  totalMs: number;
  scramble: string;
  moves: RawMove[];
  startState: CubeState;
  reconstruction: Reconstruction;
}

export interface MachineSnapshot {
  phase: Phase;
  scramble: string | null;
  follower: ScrambleFollower | null;
  spaceAt: number | null;
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

  /**
   * The turns that lead from a solved cube to the state it is in now. Kept
   * alongside cubeState (and reset with it), it lets anything that needs a
   * path *to* somewhere express it as plain algebra: invert this, append the
   * target, and the solver shortens the result.
   */
  private sinceSolved: OuterMove[] = [];

  private spaceAt: number | null = null;
  private firstMoveAt: number | null = null;
  private moves: RawMove[] = [];
  private scrambledState: CubeState | null = null;
  lastOutcome: SolveOutcome | null = null;

  private listeners = new Set<() => void>();

  constructor(
    private buffers: BufferRefs,
    private judgeCtx?: JudgeContext,
  ) {}

  setBuffers(buffers: BufferRefs, judgeCtx?: JudgeContext) {
    this.buffers = buffers;
    this.judgeCtx = judgeCtx;
  }

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
      spaceAt: this.spaceAt,
      firstMoveAt: this.firstMoveAt,
      moveCount: this.moves.length,
      lastOutcome: this.lastOutcome,
    };
  }

  /** Cube connected; we trust the cube to be solved (markSolved fixes desync). */
  connect() {
    this.cubeState = solvedState();
    this.sinceSolved = [];
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
    this.cubeState = solvedState();
    this.sinceSolved = [];
    this.resetGesture = null;
    if (this.phase === "disconnected" || this.phase === "memo" || this.phase === "exec") {
      this.emit();
      return;
    }
    this.phase = "scrambling";
    this.applyScrambleIfPending();
    this.follower = this.scramble ? new ScrambleFollower(this.scramble) : null;
    this.emit();
  }

  /**
   * The reset gesture: four quarter turns of U or D in the same direction.
   * It leaves the cube exactly as it was, so it cannot be confused with
   * solving — and no scramble or alg ever contains it — which makes it a safe
   * way to say "this cube is solved" without putting the cube down. Ignored
   * while the timer runs, where four identical turns would be a real (if
   * unusual) part of the solve.
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

  /** Provide the (async-generated) scramble for the next solve. */
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
    // back to solved: the path from solved is empty again, which also keeps
    // this from growing over a whole session
    if (isSolved(this.cubeState)) this.sinceSolved = [];
    else this.sinceSolved.push(move);
    const running = this.phase === "memo" || this.phase === "exec";
    if (running) this.resetGesture = null;
    else if (this.isResetGesture(move)) {
      this.markSolved();
      return;
    }
    switch (this.phase) {
      case "scrambling": {
        this.follower?.onMove(move);
        if (this.follower?.isDone) this.phase = "ready";
        break;
      }
      case "ready": {
        this.follower?.onMove(move);
        if (!this.follower?.isDone) this.phase = "scrambling";
        break;
      }
      case "memo": {
        this.firstMoveAt = tLocal;
        this.moves = [{ move, tLocal, tCube }];
        this.phase = "exec";
        break;
      }
      case "exec": {
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
        // moving the cube after a solve before the next scramble is shown:
        // keep tracking; once a scramble arrives the follower starts fresh
        // from whatever was tracked (corrections will surface any mismatch)
        break;
      }
    }
    this.emit();
  }

  /** The space key. */
  trigger(t: number) {
    switch (this.phase) {
      case "ready": {
        this.spaceAt = t;
        this.firstMoveAt = null;
        this.moves = [];
        this.scrambledState = this.cubeState;
        this.phase = "memo";
        break;
      }
      case "memo": {
        // gave up during memo: DNF without execution
        this.finishSolve(t, "dnf-memo");
        break;
      }
      case "exec": {
        this.finishSolve(t, "normal");
        break;
      }
      default:
        return;
    }
    this.emit();
  }

  private finishSolve(t: number, mode: "normal" | "dnf-memo") {
    const spaceAt = this.spaceAt!;
    const memoEnd = mode === "dnf-memo" ? t : this.firstMoveAt!;
    const solved = mode === "normal" && isSolved(this.cubeState);

    const useCube = this.moves.length > 0 && this.moves.every((m) => m.tCube !== undefined);
    const timed: TimedMove[] = this.moves.map((m) => ({
      move: m.move,
      t: useCube ? m.tCube! : m.tLocal,
    }));
    const startState = this.scrambledState ?? solvedState();
    const reconstruction = reconstructSolve(startState, timed, this.buffers, undefined, true, this.judgeCtx);

    this.lastOutcome = {
      result: solved ? "ok" : "dnf",
      startedAt: spaceAt,
      memoMs: memoEnd - spaceAt,
      execMs: mode === "dnf-memo" ? 0 : t - this.firstMoveAt!,
      totalMs: t - spaceAt,
      scramble: this.scramble ?? "",
      moves: this.moves,
      startState,
      reconstruction,
    };
    this.scramble = null;
    this.follower = null;
    this.phase = "done";
  }

  /** Move on to the next solve; needs the cube physically solved again. */
  nextSolve() {
    if (this.phase !== "done") return;
    this.phase = isSolved(this.cubeState) ? "scrambling" : "awaitSolved";
    this.applyScrambleIfPending();
    this.emit();
  }

  get cubeIsSolved(): boolean {
    return isSolved(this.cubeState);
  }

  /** Turns leading from a solved cube to the state the cube is in now. */
  movesSinceSolved(): OuterMove[] {
    return [...this.sinceSolved];
  }
}
