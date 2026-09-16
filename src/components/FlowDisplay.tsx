import { createMemo } from "solid-js";
import { flowOf } from "~/lib/stats";
import { formatFlow } from "~/lib/flow";
import { settings } from "~/state/settings";
import { useApp } from "~/state/app";

/**
 * What the last attempt scored, and what the cube is waiting for. While the
 * hands are moving there is nothing worth watching — the eyes are shut — so
 * the display shows the turn count and gets out of the way.
 */
export function FlowDisplay() {
  const app = useApp();

  const last = createMemo(() => {
    const id = app.selectedSolveId();
    const solve = id ? app.solves().find((s) => s.id === id) : null;
    return solve ? { solve, flow: flowOf(solve, settings.flow) } : null;
  });

  const big = createMemo(() => {
    const snap = app.snapshot();
    if (snap.phase === "solving") return `${snap.moveCount}`;
    const l = last();
    if (!l) return "—";
    return l.solve.result === "dnf" && l.flow.flow === null ? "DNF" : formatFlow(l.flow.flow);
  });

  /** The result of the attempt just finished, while it is still on screen. */
  const verdict = createMemo(() => {
    const l = last();
    if (!l) return null;
    const phase = app.snapshot().phase;
    if (phase === "solving" || phase === "ready" || phase === "disconnected") return null;
    return l.solve.result === "dnf" ? "DNF" : "solved";
  });

  const label = createMemo(() => {
    const said = verdict();
    const prefix = said ? `${said} · ` : "";
    switch (app.snapshot().phase) {
      case "disconnected":
        return "not connected";
      case "awaitSolved":
        return `${prefix}solve the cube to continue — or spin U/D four times`;
      case "scrambling":
      case "done":
        return `${prefix}scramble the cube`;
      case "ready":
        return "memorise — the first turn starts the execution";
      case "solving":
        return "turns — space when you are done";
    }
  });

  const phaseClass = createMemo(() => {
    const p = app.snapshot().phase;
    if (p === "solving") return "phase-exec";
    if (p === "ready") return "phase-ready";
    const l = last();
    if (!l) return "";
    return l.solve.result === "dnf" ? "phase-dnf" : "phase-ok";
  });

  const sub = createMemo(() => {
    if (app.snapshot().phase === "solving") return " ";
    const l = last();
    if (!l || l.flow.flow === null) return " ";
    const { pauses, pausedMs, thresholdMs } = l.flow;
    return `${pauses} pause${pauses === 1 ? "" : "s"} · ${(pausedMs / 1000).toFixed(1)}s standing still · over ${thresholdMs} ms`;
  });

  return (
    <div class={`timer-display ${phaseClass()}`}>
      <div class="timer-time mono">{big()}</div>
      <div class="timer-phase">{label()}</div>
      <div class="timer-split muted mono">{sub()}</div>
    </div>
  );
}
