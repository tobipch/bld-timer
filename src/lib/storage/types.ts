import type { Reconstruction } from "../engine/reconstruct";
import type { Primitive } from "../engine/classify";

export interface Session {
  id: string;
  name: string;
  createdAt: number;
}

/** A reason a solve failed, e.g. "Memo lost". User-defined. */
export interface DnfCategory {
  id: string;
  name: string;
  /** hex colour used in the picker and the stats bars */
  color: string;
  sortIndex: number;
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
  /** why this solve DNF'd — several reasons allowed; empty while untagged */
  dnfCategoryIds?: string[] | null;
  /** single reason of solves stored before several were possible */
  dnfCategoryId?: string | null;
  /** free-text note, e.g. what exactly went wrong */
  note?: string | null;
  /** indices of reconstruction findings the user confirmed as correct */
  confirmedFindings?: number[] | null;
}

/** Fields of a stored solve the user can change afterwards. */
export interface SolvePatch {
  result?: "ok" | "dnf";
  dnfCategoryIds?: string[] | null;
  /** only ever cleared: writing the tags supersedes the legacy single field */
  dnfCategoryId?: null;
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
  updateSolve(id: string, patch: SolvePatch): Promise<void>;
  listExecutions(): Promise<AlgExecution[]>;
  deleteExecution(id: string): Promise<void>;
  listDnfCategories(): Promise<DnfCategory[]>;
  addDnfCategory(cat: Omit<DnfCategory, "id">): Promise<DnfCategory>;
  updateDnfCategory(id: string, patch: Partial<Omit<DnfCategory, "id">>): Promise<void>;
  /** removes the category and untags every solve that used it */
  deleteDnfCategory(id: string): Promise<void>;
}
