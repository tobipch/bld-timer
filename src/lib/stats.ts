import type { SolveRecord } from "./storage/types";

/** Formats milliseconds as M:SS.cc or SS.cc. */
export function formatMs(ms: number): string {
  const cs = Math.round(ms / 10);
  const minutes = Math.floor(cs / 6000);
  const seconds = Math.floor((cs % 6000) / 100);
  const rest = cs % 100;
  const tail = `${seconds.toString().padStart(minutes > 0 ? 2 : 1, "0")}.${rest.toString().padStart(2, "0")}`;
  return minutes > 0 ? `${minutes}:${tail}` : tail;
}

export type AvgResult = { kind: "time"; ms: number } | { kind: "dnf" } | { kind: "none" };

export function formatAvg(a: AvgResult): string {
  return a.kind === "time" ? formatMs(a.ms) : a.kind === "dnf" ? "DNF" : "—";
}

/**
 * WCA trimmed average of the last n solves: drop best and worst; a DNF
 * counts as worst; two or more DNFs make the average DNF.
 */
export function aoN(solves: SolveRecord[], n: number): AvgResult {
  if (solves.length < n) return { kind: "none" };
  const window = solves.slice(-n);
  const dnfs = window.filter((s) => s.result === "dnf").length;
  if (dnfs >= 2) return { kind: "dnf" };
  const times = window.filter((s) => s.result === "ok").map((s) => s.totalMs);
  times.sort((a, b) => a - b);
  // drop the best; the worst is either the DNF or the slowest time
  const kept = dnfs === 1 ? times.slice(1) : times.slice(1, -1);
  return { kind: "time", ms: kept.reduce((a, b) => a + b, 0) / kept.length };
}

/** Best single among the last n solves. */
export function boN(solves: SolveRecord[], n: number): AvgResult {
  const window = solves.slice(-n);
  const ok = window.filter((s) => s.result === "ok");
  if (window.length < n || ok.length === 0) return ok.length ? { kind: "time", ms: Math.min(...ok.map((s) => s.totalMs)) } : { kind: "none" };
  return { kind: "time", ms: Math.min(...ok.map((s) => s.totalMs)) };
}

/** Best aoN over the whole history. */
export function bestAoN(solves: SolveRecord[], n: number): AvgResult {
  let best: AvgResult = { kind: "none" };
  for (let i = n; i <= solves.length; i++) {
    const a = aoN(solves.slice(0, i), n);
    if (a.kind === "time" && (best.kind !== "time" || a.ms < best.ms)) best = a;
  }
  return best;
}

export function successRate(solves: SolveRecord[]): number | null {
  if (solves.length === 0) return null;
  return solves.filter((s) => s.result === "ok").length / solves.length;
}

export function bestSingle(solves: SolveRecord[]): AvgResult {
  const ok = solves.filter((s) => s.result === "ok");
  if (ok.length === 0) return { kind: "none" };
  return { kind: "time", ms: Math.min(...ok.map((s) => s.totalMs)) };
}

export function meanSplit(solves: SolveRecord[]): { memo: number; exec: number } | null {
  const ok = solves.filter((s) => s.result === "ok" && s.execMs > 0);
  if (ok.length === 0) return null;
  return {
    memo: ok.reduce((a, s) => a + s.memoMs, 0) / ok.length,
    exec: ok.reduce((a, s) => a + s.execMs, 0) / ok.length,
  };
}
