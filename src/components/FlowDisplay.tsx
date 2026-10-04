import { createMemo } from "solid-js";
import { flowOf, formatMs } from "~/lib/stats";
import { formatFlow } from "~/lib/flow";
import { settings } from "~/state/settings";
import { useApp } from "~/state/app";

/**
 * The selected attempt's flow, or the turn count while solving. The colour
 * says the rest: blue running, green solved, red DNF.
 */
export function FlowDisplay() {
  const app = useApp();

  const last = createMemo(() => {
    const id = app.selectedSolveId();
    const solve = id ? app.solves().find((s) => s.id === id) : null;
    return solve ? { solve, flow: flowOf(solve, settings.flow) } : null;
  });

  const solving = () => app.snapshot().phase === "solving";

  const big = createMemo(() => {
    if (solving()) return `${app.snapshot().moveCount}`;
    const l = last();
    if (!l) return "—";
    return l.solve.result === "dnf" && l.flow.flow === null ? "DNF" : formatFlow(l.flow.flow);
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
    const phase = app.snapshot().phase;
    if (phase === "ready") return "memo";
    const l = last();
    if (solving() || !l) return " ";
    const { turns, execMs, pauses } = l.flow;
    const dnf = l.solve.result === "dnf" ? "DNF · " : "";
    return `${dnf}${turns} turns · ${formatMs(execMs)} · ${pauses} pause${pauses === 1 ? "" : "s"}`;
  });

  return (
    <div class={`timer-display ${phaseClass()}`}>
      <div class="timer-time mono" classList={{ placeholder: !solving() && !last() }}>
        {big()}
      </div>
      <div class="timer-split muted mono">{sub()}</div>
    </div>
  );
}
