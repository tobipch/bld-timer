import type { OuterMove } from "../cube/state";

export interface CubeMoveMsg {
  move: OuterMove;
  tLocal: number;
  tCube?: number;
}

export interface CubeIO {
  readonly kind: "smart" | "virtual";
  readonly name: string;
  onMove(cb: (m: CubeMoveMsg) => void): () => void;
  onBattery?(cb: (pct: number) => void): () => void;
  disconnect(): void;
}
