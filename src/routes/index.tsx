import { A } from "@solidjs/router";
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { ConnectBar } from "~/components/ConnectBar";
import { DnfPicker } from "~/components/DnfPicker";
import { DnfSummary } from "~/components/DnfSummary";
import { Onboarding } from "~/components/Onboarding";
import { DevPanel } from "~/components/DevPanel";
import { ScrambleView } from "~/components/ScrambleView";
import { SolveNotes } from "~/components/SolveNotes";
import { StatsPanel } from "~/components/StatsPanel";
import { TimeList } from "~/components/TimeList";
import { TimerDisplay } from "~/components/TimerDisplay";
import { categoriesOf } from "~/lib/dnf";
import { formatMs } from "~/lib/stats";
import type { SolveRecord } from "~/lib/storage/types";
import { settings } from "~/state/settings";
import { useApp } from "~/state/app";

export default function TimerPage() {
  return (
    <Show when={settings.profile.onboarded} fallback={<Onboarding />}>
      <TimerInner />
    </Show>
  );
}

/**
 * What happened last: the time, and — when it failed — the one question worth
 * answering right away. Everything else lives one click deeper, in the
 * replay.
 */
function LastSolveCard(props: { solve: SolveRecord }) {
  const app = useApp();
  const cats = createMemo(() => categoriesOf(props.solve, app.dnfCategories()));
  const isDnf = () => props.solve.result === "dnf";

  return (
    <div class="card last-solve" classList={{ "is-dnf": isDnf() }}>
      <div class="last-solve-head">
        <span class="mono last-solve-time" classList={{ bad: isDnf(), good: !isDnf() }}>
          {isDnf() ? "DNF" : formatMs(props.solve.totalMs)}
        </span>
        <span class="muted mono">
          {formatMs(props.solve.memoMs)} + {formatMs(props.solve.execMs)} · {props.solve.moves.length} moves
        </span>
        <A class="primary-link" href={`/solve/${props.solve.id}`}>
          ▶ Replay it
        </A>
      </div>

      <Show when={isDnf()}>
        <div class="last-solve-ask">
          <span class="ask-label" classList={{ warn: cats().length === 0 }}>
            <Show when={cats().length > 0} fallback="Why did it fail?">
              Failed because of{" "}
              <For each={cats()}>
                {(c) => (
                  <span class="dnf-current" style={{ "--chip": c.color }}>
                    {c.name}
                  </span>
                )}
              </For>
            </Show>
          </span>
          <DnfPicker solve={props.solve} hotkeys />
          <span class="muted ask-hint">
            press 1–9 to toggle · pick as many as apply · or find out in the replay
          </span>
        </div>
        <SolveNotes solve={props.solve} />
      </Show>
    </div>
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

  const shownSolve = createMemo(() => {
    const id = app.selectedSolveId();
    return id ? app.solves().find((s) => s.id === id) ?? null : null;
  });

  const running = () => {
    const p = app.snapshot().phase;
    return p === "memo" || p === "exec";
  };

  return (
    <div class="timer-page" classList={{ running: running() }}>
      <ConnectBar />
      <ScrambleView />
      <div class="timer-grid">
        <TimeList />
        <div class="timer-center">
          <TimerDisplay armed={armed()} />
          <Show when={!running() && shownSolve()}>{(s) => <LastSolveCard solve={s()} />}</Show>
          <DevPanel />
        </div>
        <div class="timer-side">
          <DnfSummary />
          <StatsPanel />
        </div>
      </div>
    </div>
  );
}
