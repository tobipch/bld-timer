/**
 * Flow: how much of an execution was actually spent turning.
 *
 * A blindfolded execution is a sequence of turns separated by gaps. Short
 * gaps are turning; long gaps are standing still — recall, recognition, a
 * regrip. Flow is the share of the execution that was not standing still:
 *
 *   flow = (execution − paused) / execution
 *
 * Two deliberate choices:
 *
 * - **The threshold scales with the solver.** 200 ms between turns is a
 *   pause for someone at 8 TPS and perfectly normal turning at 4. The
 *   threshold is a multiple of the solver's own median gap *in that solve*,
 *   with a floor so a very slow solve cannot declare its own crawl fluent.
 * - **Only the part above the threshold counts.** Counting the whole gap
 *   would put a cliff right where the measurement is least certain: a
 *   249 ms gap would be free and a 251 ms gap would cost a quarter second.
 *   Counting the excess makes the value continuous — a gap just over the
 *   line costs just over nothing.
 *
 * The gap before the stop keypress is not part of this by construction:
 * the execution window ends with the last turn.
 */

export interface FlowOptions {
  /** never call a gap shorter than this a pause, however fast the solver is */
  floorMs: number;
  /** a pause is this many times the solver's own median gap */
  factor: number;
}

export const DEFAULT_FLOW_OPTIONS: FlowOptions = { floorMs: 250, factor: 3 };

/**
 * Turns closer together than this are one event, not two: a gyro-less smart
 * cube reports a slice as its two outer turns with the same timestamp, and a
 * half turn often arrives as two ticks of the same motion. Counting those
 * zero gaps would drag the median down and make every real gap look like a
 * pause.
 */
const SIMULTANEOUS_MS = 20;

export interface FlowResult {
  /** 0..1, or null when there was not enough execution to measure */
  flow: number | null;
  /** first turn to last turn */
  execMs: number;
  /** time spent standing still, i.e. the part of the gaps above the threshold */
  pausedMs: number;
  /** gap from which on standing still is counted */
  thresholdMs: number;
  /** how many gaps were over the threshold */
  pauses: number;
  /** longest single gap */
  longestPauseMs: number;
  /** turns after merging simultaneous ones */
  turns: number;
}

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const EMPTY: FlowResult = {
  flow: null,
  execMs: 0,
  pausedMs: 0,
  thresholdMs: 0,
  pauses: 0,
  longestPauseMs: 0,
  turns: 0,
};

/**
 * Flow from the timestamps of the turns of one execution.
 *
 * Fewer than two turns is not an execution — an attempt given up before
 * moving has no flow to measure, and says so with null rather than with a
 * number that would be read as a score.
 */
export function computeFlow(times: number[], opts: FlowOptions = DEFAULT_FLOW_OPTIONS): FlowResult {
  const turns: number[] = [];
  for (const t of times) {
    if (turns.length === 0 || t - turns[turns.length - 1] > SIMULTANEOUS_MS) turns.push(t);
    else turns[turns.length - 1] = t;
  }
  if (turns.length < 2) return { ...EMPTY, turns: turns.length };

  const gaps: number[] = [];
  for (let i = 1; i < turns.length; i++) gaps.push(turns[i] - turns[i - 1]);

  // below a handful of gaps there is no personal speed to compare against,
  // so the floor decides alone
  const thresholdMs =
    gaps.length >= 4 ? Math.max(opts.floorMs, Math.round(opts.factor * median(gaps))) : opts.floorMs;

  let pausedMs = 0;
  let pauses = 0;
  for (const g of gaps) {
    if (g <= thresholdMs) continue;
    pausedMs += g - thresholdMs;
    pauses++;
  }

  const execMs = turns[turns.length - 1] - turns[0];
  const flow = execMs > 0 ? Math.min(1, Math.max(0, (execMs - pausedMs) / execMs)) : null;

  return {
    flow,
    execMs,
    pausedMs,
    thresholdMs,
    pauses,
    longestPauseMs: gaps.length > 0 ? Math.max(...gaps) : 0,
    turns: turns.length,
  };
}

/** Flow as a percentage, e.g. "87.4%". */
export function formatFlow(flow: number | null): string {
  return flow === null ? "—" : `${(flow * 100).toFixed(1)}%`;
}
