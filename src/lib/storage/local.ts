import { MODE_LABEL } from "../scramble";
import type { ScrambleMode } from "../scramble";
import { missingModes, sessionMode } from "../sessions";
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

function newSession(mode: ScrambleMode, name = MODE_LABEL[mode]): Session {
  return { id: newId(), name, createdAt: Date.now(), mode };
}

export function createLocalStorageAdapter(): StorageAdapter {
  return {
    mode: "local",
    async listSessions() {
      // sessions stored before modes existed read as "full", and every mode
      // gets a session, so the mode switch always has somewhere to go
      const stored = read<Session>(KEY.sessions).map((s) => ({ ...s, mode: sessionMode(s.mode) }));
      const sessions = [...stored, ...missingModes(stored).map((m) => newSession(m))];
      if (JSON.stringify(sessions) !== JSON.stringify(read<Session>(KEY.sessions))) {
        write(KEY.sessions, sessions);
      }
      return sessions;
    },
    async addSession(name: string, mode: ScrambleMode) {
      const sessions = read<Session>(KEY.sessions);
      const s = newSession(mode, name);
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
