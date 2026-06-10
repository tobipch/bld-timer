import { createMemo, createSignal, onCleanup, onMount, Show } from "solid-js";
import { ConnectBar } from "~/components/ConnectBar";
import { DevPanel } from "~/components/DevPanel";
import { ReconstructionView } from "~/components/ReconstructionView";
import { ScrambleView } from "~/components/ScrambleView";
import { StatsPanel } from "~/components/StatsPanel";
import { TimeList } from "~/components/TimeList";
import { TimerDisplay } from "~/components/TimerDisplay";
import { formatMs } from "~/lib/stats";
import { settings } from "~/state/settings";
import { useApp } from "~/state/app";

export default function TimerPage() {
  const app = useApp();
  const [armed, setArmed] = createSignal(false);
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let spaceDown = false;

  onMount(() => {
    const isTyping = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      return el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || isTyping(e)) return;
      e.preventDefault();
      if (spaceDown) return;
      spaceDown = true;
      const phase = app.snapshot().phase;
      if (phase === "memo" || phase === "exec") {
        app.trigger();
        return;
      }
      if (phase !== "ready") return;
      if (settings.holdMs <= 0) {
        app.trigger();
      } else {
        holdTimer = setTimeout(() => setArmed(true), settings.holdMs);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      spaceDown = false;
      if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
      if (armed()) {
        setArmed(false);
        if (app.snapshot().phase === "ready") app.trigger();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    onCleanup(() => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    });
  });

  const selectedSolve = createMemo(() => {
    const id = app.selectedSolveId();
    return id ? app.solves().find((s) => s.id === id) ?? null : null;
  });

  return (
    <div class="timer-page">
      <ConnectBar />
      <ScrambleView />
      <div class="timer-grid">
        <TimeList />
        <div class="timer-center">
          <TimerDisplay armed={armed()} />
          <Show when={selectedSolve()}>
            {(s) => (
              <ReconstructionView
                rec={s().reconstruction}
                title={`${s().result === "dnf" ? "DNF" : formatMs(s().totalMs)} — memo ${formatMs(
                  s().memoMs,
                )} · exec ${formatMs(s().execMs)}`}
              />
            )}
          </Show>
          <DevPanel />
        </div>
        <StatsPanel />
      </div>
    </div>
  );
}
