/** A practice session. */
export interface Session {
  id: string;
  name: string;
  createdAt: number;
}

/**
 * One attempt. Flow is not stored: it is derived from the move timestamps,
 * so changing the pause threshold re-reads the whole history instead of
 * leaving old attempts scored by an old setting.
 */
export interface SolveRecord {
  id: string;
  sessionId: string;
  startedAt: number; // epoch ms
  result: "ok" | "dnf";
  /** first turn to last turn */
  execMs: number;
  scramble: string;
  /** outer move + timestamp (cube clock when available) */
  moves: { m: string; t: number }[];
}

/** Fields of a stored attempt the user can change afterwards. */
export interface SolvePatch {
  result?: "ok" | "dnf";
}

export interface StorageAdapter {
  readonly mode: "local" | "remote";
  listSessions(): Promise<Session[]>;
  addSession(name: string): Promise<Session>;
  listSolves(sessionId?: string): Promise<SolveRecord[]>;
  addSolve(rec: Omit<SolveRecord, "id">): Promise<SolveRecord>;
  deleteSolve(id: string): Promise<void>;
  /** Delete every attempt of one session; the session itself stays. */
  clearSession(sessionId: string): Promise<void>;
  updateSolve(id: string, patch: SolvePatch): Promise<void>;
}
