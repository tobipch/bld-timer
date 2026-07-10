import type { AlgExecution, Session, SolveRecord, StorageAdapter } from "./types";

/** API-backed adapter (Neon via the server routes). */

export interface ServerStatus {
  db: boolean;
  guestAllowed: boolean;
  /** WCA OAuth login configured on the server */
  wca?: boolean;
  user: { id: string; email: string; name: string } | null;
}

export async function fetchServerStatus(): Promise<ServerStatus | null> {
  try {
    const res = await fetch("/api/data/status");
    if (!res.ok) return null;
    return (await res.json()) as ServerStatus;
  } catch {
    return null;
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      msg = ((await res.json()) as { error?: string }).error ?? msg;
    } catch {
      // keep status text
    }
    throw new Error(`API error: ${msg}`);
  }
  return (await res.json()) as T;
}

const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export function createRemoteAdapter(): StorageAdapter {
  return {
    mode: "remote",
    listSessions: () => call<Session[]>("/api/data/sessions"),
    addSession: (name) => call<Session>("/api/data/sessions", post({ name })),
    async listSolves(sessionId?: string) {
      const solves = await call<SolveRecord[]>("/api/data/solves");
      return sessionId ? solves.filter((s) => s.sessionId === sessionId) : solves;
    },
    addSolveWithExecutions: (rec, execs) =>
      call<{ solve: SolveRecord; executions: AlgExecution[] }>(
        "/api/data/solves",
        post({ solve: rec, executions: execs }),
      ),
    deleteSolve: (id) => call(`/api/data/solves/${id}`, { method: "DELETE" }),
    updateSolveFeedback: (id, patch) =>
      call(`/api/data/solves/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      }),
    listExecutions: () => call<AlgExecution[]>("/api/data/executions"),
    deleteExecution: (id) => call(`/api/data/executions/${id}`, { method: "DELETE" }),
  };
}
