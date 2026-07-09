import { createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { formatMs } from "~/lib/stats";
import { settings } from "~/state/settings";
import { useApp } from "~/state/app";

export function TimerDisplay(props: { armed: boolean }) {
  const app = useApp();
  const [now, setNow] = createSignal(0);

  createEffect(() => {
    const phase = app.snapshot().phase;
    if (phase === "memo" || phase === "exec") {
      const id = setInterval(() => setNow(performance.now()), 37);
      onCleanup(() => clearInterval(id));
    }
  });

  const text = createMemo(() => {
    const snap = app.snapshot();
    switch (snap.phase) {
      case "memo":
      case "exec": {
        const hide =
          !settings.showRunningTime || (snap.phase === "memo" && !settings.showTimeDuringMemo);
        if (hide) return snap.phase === "memo" ? "memo" : "solve";
        now();
        return formatMs(Math.max(0, performance.now() - (snap.spaceAt ?? 0)));
      }
      case "done": {
        const o = snap.lastOutcome;
        if (!o) return "—";
        return o.result === "dnf" ? `DNF (${formatMs(o.totalMs)})` : formatMs(o.totalMs);
      }
      default: {
        const o = snap.lastOutcome;
        return o ? (o.result === "dnf" ? `DNF (${formatMs(o.totalMs)})` : formatMs(o.totalMs)) : "0.00";
      }
    }
  });

  const phaseLabel = createMemo(() => {
    const snap = app.snapshot();
    switch (snap.phase) {
      case "disconnected":
        return "not connected";
      case "awaitSolved":
        return "solve the cube to continue";
      case "scrambling":
        return "scramble the cube";
      case "ready":
        return props.armed ? "release space to start" : "ready — hold space, release to start memo";
      case "memo":
        return "MEMO";
      case "exec":
        return "EXECUTION";
      case "done": {
        const o = snap.lastOutcome;
        if (o && o.result === "ok") return "solved!";
        return "DNF";
      }
    }
  });

  const phaseClass = createMemo(() => {
    const p = app.snapshot().phase;
    const o = app.snapshot().lastOutcome;
    if (p === "memo") return "phase-memo";
    if (p === "exec") return "phase-exec";
    if (p === "ready") return props.armed ? "phase-armed" : "phase-ready";
    if (p === "done") return o?.result === "ok" ? "phase-ok" : "phase-dnf";
    return "";
  });

  const split = createMemo(() => {
    const o = app.snapshot().lastOutcome;
    const p = app.snapshot().phase;
    if (!o || p === "memo" || p === "exec") return null;
    if (o.moves.length === 0) return null;
    return `memo ${formatMs(o.memoMs)} · exec ${formatMs(o.execMs)}`;
  });

  return (
    <div class={`timer-display ${phaseClass()}`}>
      <div class="timer-time mono">{text()}</div>
      <div class="timer-phase">{phaseLabel()}</div>
      <div class="timer-split muted mono">{split() ?? " "}</div>
    </div>
  );
}
