import { algToOuterMoves, outerMoveFromString } from "../cube/alg";
import type { OuterMove } from "../cube/state";
import type { CubeIO, CubeMoveMsg } from "./types";

/**
 * Keyboard/button-driven simulated smart cube for development and testing
 * without Bluetooth hardware. Emits moves exactly like the real connection.
 */
export class VirtualCube implements CubeIO {
  readonly kind = "virtual" as const;
  readonly name = "Virtual cube";
  private listeners = new Set<(m: CubeMoveMsg) => void>();

  onMove(cb: (m: CubeMoveMsg) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  emit(move: OuterMove) {
    const t = Math.round(performance.now());
    for (const cb of this.listeners) cb({ move, tLocal: t, tCube: t });
  }

  emitString(s: string) {
    this.emit(outerMoveFromString(s));
  }

  /** Apply a whole alg (slices/wide/rotations translated like real hardware). */
  emitAlg(alg: string) {
    for (const m of algToOuterMoves(alg)) this.emit(m);
  }

  disconnect() {
    this.listeners.clear();
  }
}
