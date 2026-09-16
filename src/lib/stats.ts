import { computeFlow, DEFAULT_FLOW_OPTIONS, type FlowOptions, type FlowResult } from "./flow";
import type { SolveRecord } from "./storage/types";

/**
 * Statistics over flow values.
 *
 * Every attempt scores the flow of its execution — a failed attempt too. A
 * DNF is a statement about the memo or the algorithms, not about how fluently
 * the hands moved, and scoring it 0 would quietly turn the average into a
 * success rate. The success rate is therefore reported next to the averages,
 * as its own number, and neither distorts the other.
 *
 * The one attempt that scores 0 is the one that was given up before the
 * second turn: there was no execution, so there is no flow in it to measure.
 */

/** Formats milliseconds as M:SS.cc or SS.cc. */
export function formatMs(ms: number): string {
  const cs = Math.round(ms / 10);
  const minutes = Math.floor(cs / 6000);
  const seconds = Math.floor((cs % 6000) / 100);
  const rest = cs % 100;
  const tail = `${seconds.toString().padStart(minutes > 0 ? 2 : 1, "0")}.${rest.toString().padStart(2, "0")}`;
  return minutes > 0 ? `${minutes}:${tail}` : tail;
}

export function formatPct(x: number | null): string {
  return x === null ? "—" : `${Math.round(x * 100)}%`;
}

export type AvgResult = { kind: "flow"; value: number } | { kind: "none" };

export function formatAvg(a: AvgResult): string {
  return a.kind === "flow" ? `${(a.value * 100).toFixed(1)}%` : "—";
}

/** The measured execution of a solve. */
export function flowOf(solve: Pick<SolveRecord, "moves">, opts: FlowOptions = DEFAULT_FLOW_OPTIONS): FlowResult {
  return computeFlow(
    solve.moves.map((m) => m.t),
    opts,
  );
}

/** What an attempt contributes to the averages. */
export function scoreOf(solve: Pick<SolveRecord, "moves">, opts: FlowOptions = DEFAULT_FLOW_OPTIONS): number {
  return flowOf(solve, opts).flow ?? 0;
}

export function scoresOf(solves: Pick<SolveRecord, "moves">[], opts: FlowOptions = DEFAULT_FLOW_OPTIONS): number[] {
  return solves.map((s) => scoreOf(s, opts));
}

/**
 * How many values are dropped from each end of an aoN: one for ao5 and ao12,
 * 5% for the long averages — the convention every speedcubing timer uses.
 */
export function trimCount(n: number): number {
  return Math.max(1, Math.ceil(n * 0.05));
}

/** Trimmed mean of the last n values: drop the best and the worst ends. */
export function aoN(values: number[], n: number): AvgResult {
  if (values.length < n) return { kind: "none" };
  return trimmedMean(values.slice(values.length - n));
}

function trimmedMean(window: number[]): AvgResult {
  const trim = trimCount(window.length);
  const kept = [...window].sort((a, b) => a - b).slice(trim, window.length - trim);
  if (kept.length === 0) return { kind: "none" };
  return { kind: "flow", value: kept.reduce((a, b) => a + b, 0) / kept.length };
}

/** Best aoN anywhere in the history. */
export function bestAoN(values: number[], n: number): AvgResult {
  let best: AvgResult = { kind: "none" };
  for (let i = n; i <= values.length; i++) {
    const a = trimmedMean(values.slice(i - n, i));
    if (a.kind === "flow" && (best.kind !== "flow" || a.value > best.value)) best = a;
  }
  return best;
}

/** Rolling aoN at every point, for the chart; null before there are n values. */
export function rollingAoN(values: number[], n: number): (number | null)[] {
  return values.map((_, i) => {
    if (i + 1 < n) return null;
    const a = trimmedMean(values.slice(i + 1 - n, i + 1));
    return a.kind === "flow" ? a.value : null;
  });
}

export function bestSingle(values: number[]): AvgResult {
  if (values.length === 0) return { kind: "none" };
  return { kind: "flow", value: Math.max(...values) };
}

export function successRate(solves: Pick<SolveRecord, "result">[]): number | null {
  if (solves.length === 0) return null;
  return solves.filter((s) => s.result === "ok").length / solves.length;
}
