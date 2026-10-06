import { beforeEach, describe, expect, it } from "vitest";
import { createLocalStorageAdapter } from "./local";

beforeEach(() => {
  const data = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  } as Storage;
});

const attempt = (sessionId: string) => ({
  sessionId,
  startedAt: 0,
  result: "ok" as const,
  execMs: 0,
  scramble: "",
  moves: [],
});

describe("clearSession", () => {
  it("deletes the attempts of that session and nothing else", async () => {
    const store = createLocalStorageAdapter();
    await store.addSolve(attempt("a"));
    await store.addSolve(attempt("a"));
    await store.addSolve(attempt("b"));
    await store.clearSession("a");
    const left = await store.listSolves();
    expect(left.map((s) => s.sessionId)).toEqual(["b"]);
  });
});
