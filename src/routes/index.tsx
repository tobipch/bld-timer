import { createMemo, createSignal, onCleanup, onMount, Show } from "solid-js";
import { ConnectBar } from "~/components/ConnectBar";
import { Onboarding } from "~/components/Onboarding";
import { DevPanel } from "~/components/DevPanel";
import { ReconstructionView } from "~/components/ReconstructionView";
import { ScrambleView } from "~/components/ScrambleView";
import { SolveNotes } from "~/components/SolveNotes";
import { StatsPanel } from "~/components/StatsPanel";
import { TimeList } from "~/components/TimeList";
import { TimerDisplay } from "~/components/TimerDisplay";
import { formatMs } from "~/lib/stats";
import { settings } from "~/state/settings";
import { useApp } from "~/state/app";

export default function TimerPage() {
  return (
    <Show when={settings.profile.onboarded} fallback={<Onboarding />}>
      <TimerInner />
    </Show>
  );
}

function TimerInner() {
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
        // stopping is immediate, on press
        app.trigger();
        return;
      }
      if (phase !== "ready") return;
      // starting happens on release; holding arms the timer first
      if (settings.holdMs <= 0) {
        setArmed(true);
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
              <>
                <ReconstructionView
                  rec={s().reconstruction}
                  scramble={s().scramble}
                  moves={s().moves}
                  compact
                  title={`${s().result === "dnf" ? "DNF" : formatMs(s().totalMs)} — memo ${formatMs(
                    s().memoMs,
                  )} · exec ${formatMs(s().execMs)}`}
                  feedback={{
                    confirmed: s().confirmedFindings ?? [],
                    onToggleFinding: (idx) => {
                      const cur = new Set(s().confirmedFindings ?? []);
                      if (cur.has(idx)) cur.delete(idx);
                      else cur.add(idx);
                      void app.setSolveFeedback(s().id, { confirmedFindings: [...cur].sort() });
                    },
                  }}
                />
                <SolveNotes solve={s()} />
              </>
            )}
          </Show>
          <DevPanel />
        </div>
        <StatsPanel />
      </div>
    </div>
  );
}
