import type { Reconstruction } from "../engine/reconstruct";
import type { Primitive } from "../engine/classify";

export interface Session {
  id: string;
  name: string;
  createdAt: number;
}

export interface SolveRecord {
  id: string;
  sessionId: string;
  startedAt: number; // epoch ms
  result: "ok" | "dnf";
  totalMs: number;
  memoMs: number;
  execMs: number;
  scramble: string;
  /** outer move + timestamp (cube clock when available) */
  moves: { m: string; t: number }[];
  reconstruction: Reconstruction;
}

export interface AlgExecution {
  id: string;
  solveId: string;
  sessionId: string;
  at: number;
  caseKey: string;
  primitive: Primitive;
  moves: string;
  execMs: number;
  recogMs: number;
}

export interface StorageAdapter {
  readonly mode: "local" | "remote";
  listSessions(): Promise<Session[]>;
  addSession(name: string): Promise<Session>;
  listSolves(sessionId?: string): Promise<SolveRecord[]>;
  addSolve(rec: Omit<SolveRecord, "id">): Promise<SolveRecord>;
  deleteSolve(id: string): Promise<void>;
  listExecutions(): Promise<AlgExecution[]>;
  addExecutions(list: Omit<AlgExecution, "id">[]): Promise<AlgExecution[]>;
  deleteExecution(id: string): Promise<void>;
}
