import { MODE_LABEL, SCRAMBLE_MODES } from "../scramble";
import type { ScrambleMode } from "../scramble";
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

/** One session per scramble mode, so there is always somewhere to solve. */
function seedSessions(): Session[] {
  return SCRAMBLE_MODES.map((mode) => ({
    id: newId(),
    name: MODE_LABEL[mode],
    createdAt: Date.now(),
    mode,
  }));
}

export function createLocalStorageAdapter(): StorageAdapter {
  return {
    mode: "local",
    async listSessions() {
      let sessions = read<Session>(KEY.sessions);
      if (sessions.length === 0) {
        sessions = seedSessions();
        write(KEY.sessions, sessions);
      }
      return sessions;
    },
    async addSession(name: string, mode: ScrambleMode) {
      const sessions = read<Session>(KEY.sessions);
      const s: Session = { id: newId(), name, createdAt: Date.now(), mode };
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
