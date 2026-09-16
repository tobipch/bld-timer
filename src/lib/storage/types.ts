import type { ScrambleMode } from "../scramble";

/**
 * A practice session. The scramble mode belongs to the session rather than to
 * a switch somewhere: edge-only, corner-only and full solves are different
 * exercises, and their numbers are not comparable.
 */
export interface Session {
  id: string;
  name: string;
  createdAt: number;
  mode: ScrambleMode;
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
  addSession(name: string, mode: ScrambleMode): Promise<Session>;
  listSolves(sessionId?: string): Promise<SolveRecord[]>;
  addSolve(rec: Omit<SolveRecord, "id">): Promise<SolveRecord>;
  deleteSolve(id: string): Promise<void>;
  updateSolve(id: string, patch: SolvePatch): Promise<void>;
}
