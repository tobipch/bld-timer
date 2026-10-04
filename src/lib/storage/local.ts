import { DEFAULT_SESSION_NAME, isRetiredSession } from "../sessions";
import type { Session, SolveRecord, StorageAdapter } from "./types";

/**
 * localStorage adapter: used in dev and as the fallback when no backend is
 * configured. Same interface as the remote adapter.
 */

const KEY = {
  sessions: "bld-timer.sessions",
  solves: "bld-timer.solves",
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

function newSession(name: string): Session {
  return { id: newId(), name, createdAt: Date.now() };
}

export function createLocalStorageAdapter(): StorageAdapter {
  return {
    mode: "local",
    async listSessions() {
      const stored = read<Session & { mode?: string }>(KEY.sessions);
      const shown = stored.filter((s) => !isRetiredSession(s.mode));
      if (shown.length > 0) return shown;
      const first = newSession(DEFAULT_SESSION_NAME);
      write(KEY.sessions, [...stored, first]);
      return [first];
    },
    async addSession(name: string) {
      const sessions = read<Session>(KEY.sessions);
      const s = newSession(name);
      write(KEY.sessions, [...sessions, s]);
      return s;
    },
    async listSolves(sessionId?: string) {
      const solves = read<SolveRecord>(KEY.solves);
      return sessionId ? solves.filter((s) => s.sessionId === sessionId) : solves;
    },
    async addSolve(rec) {
      const solve: SolveRecord = { ...rec, id: newId() };
      write(KEY.solves, [...read<SolveRecord>(KEY.solves), solve]);
      return solve;
    },
    async updateSolve(id, patch) {
      write(
        KEY.solves,
        read<SolveRecord>(KEY.solves).map((s) => (s.id === id ? { ...s, ...patch } : s)),
      );
    },
    async deleteSolve(id) {
      write(
        KEY.solves,
        read<SolveRecord>(KEY.solves).filter((s) => s.id !== id),
      );
    },
  };
}
