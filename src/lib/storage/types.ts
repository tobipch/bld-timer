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
  /** user feedback on this solve */
  note?: string | null;
  /** indices of reconstruction findings the user confirmed as correct */
  confirmedFindings?: number[] | null;
}

export interface SolveFeedbackPatch {
  note?: string | null;
  confirmedFindings?: number[] | null;
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
  /** persist a solve and its recorded alg executions together */
  addSolveWithExecutions(
    rec: Omit<SolveRecord, "id">,
    execs: Omit<AlgExecution, "id" | "solveId">[],
  ): Promise<{ solve: SolveRecord; executions: AlgExecution[] }>;
  deleteSolve(id: string): Promise<void>;
  updateSolveFeedback(id: string, patch: SolveFeedbackPatch): Promise<void>;
  listExecutions(): Promise<AlgExecution[]>;
  deleteExecution(id: string): Promise<void>;
}
