import type { AlgExecution, Session, SolveRecord, StorageAdapter } from "./types";

/**
 * localStorage adapter: used in dev and as the guest fallback when no
 * backend is configured. Same interface as the remote adapter.
 */

const KEY = {
  sessions: "bld-timer.sessions",
  solves: "bld-timer.solves",
  executions: "bld-timer.executions",
};

function read<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]") as T[];
  } catch {
    return [];
  }
}

function write<T>(key: string, items: T[]) {
  localStorage.setItem(key, JSON.stringify(items));
}

const newId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

export function createLocalStorageAdapter(): StorageAdapter {
  return {
    mode: "local",
    async listSessions() {
      let sessions = read<Session>(KEY.sessions);
      if (sessions.length === 0) {
        sessions = [{ id: newId(), name: "Session 1", createdAt: Date.now() }];
        write(KEY.sessions, sessions);
      }
      return sessions;
    },
    async addSession(name: string) {
      const sessions = read<Session>(KEY.sessions);
      const s: Session = { id: newId(), name, createdAt: Date.now() };
      write(KEY.sessions, [...sessions, s]);
      return s;
    },
    async listSolves(sessionId?: string) {
      const solves = read<SolveRecord>(KEY.solves);
      return sessionId ? solves.filter((s) => s.sessionId === sessionId) : solves;
    },
    async addSolveWithExecutions(rec, execs) {
      const solves = read<SolveRecord>(KEY.solves);
      const solve: SolveRecord = { ...rec, id: newId() };
      write(KEY.solves, [...solves, solve]);
      const existing = read<AlgExecution>(KEY.executions);
      const executions: AlgExecution[] = execs.map((e) => ({ ...e, id: newId(), solveId: solve.id }));
      write(KEY.executions, [...existing, ...executions]);
      return { solve, executions };
    },
    async deleteSolve(id) {
      write(
        KEY.solves,
        read<SolveRecord>(KEY.solves).filter((s) => s.id !== id),
      );
      write(
        KEY.executions,
        read<AlgExecution>(KEY.executions).filter((e) => e.solveId !== id),
      );
    },
    async listExecutions() {
      return read<AlgExecution>(KEY.executions);
    },
    async deleteExecution(id) {
      write(
        KEY.executions,
        read<AlgExecution>(KEY.executions).filter((e) => e.id !== id),
      );
    },
  };
}
