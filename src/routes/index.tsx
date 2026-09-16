import { createMemo, onCleanup, onMount, Show } from "solid-js";
import { ConnectBar } from "~/components/ConnectBar";
import { DevPanel } from "~/components/DevPanel";
import { FlowDisplay } from "~/components/FlowDisplay";
import { ScrambleView } from "~/components/ScrambleView";
import { SessionBar } from "~/components/SessionBar";
import { StatsPanel } from "~/components/StatsPanel";
import { TimeList } from "~/components/TimeList";
import { formatFlow } from "~/lib/flow";
import { flowOf, formatMs } from "~/lib/stats";
import type { SolveRecord } from "~/lib/storage/types";
import { settings } from "~/state/settings";
import { useApp } from "~/state/app";

/** What the last attempt was made of — the numbers behind its flow value. */
function LastAttemptCard(props: { solve: SolveRecord }) {
  const app = useApp();
  const flow = createMemo(() => flowOf(props.solve, settings.flow));
  const isDnf = () => props.solve.result === "dnf";

  return (
    <div class="card last-solve" classList={{ "is-dnf": isDnf() }}>
      <div class="last-solve-head">
        <span class="mono last-solve-time" classList={{ bad: isDnf(), good: !isDnf() }}>
          {formatFlow(flow().flow)}
        </span>
        <span class="muted mono">
          {flow().turns} turns · {formatMs(flow().execMs)} · {flow().pauses} pauses · longest{" "}
          {formatMs(flow().longestPauseMs)}
        </span>
        <button
          class="link-btn"
          onClick={() => void app.updateSolve(props.solve.id, isDnf() ? "ok" : "dnf")}
        >
          {isDnf() ? "count as solved" : "mark as DNF"}
        </button>
      </div>
      <Show when={isDnf()}>
        <span class="muted ask-hint">
          DNF — the flow of the execution still counts, the success rate keeps the score of what
          failed.
        </span>
      </Show>
    </div>
  );
}

export default function TimerPage() {
  const app = useApp();

  onMount(() => {
    const isTyping = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e) || e.repeat) return;
      if (e.code === "Space") {
        // stopping is immediate, on press
        e.preventDefault();
        app.trigger();
      } else if (e.code === "Escape") {
        app.discard();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    onCleanup(() => window.removeEventListener("keydown", onKeyDown));
  });

  const shownSolve = createMemo(() => {
    const id = app.selectedSolveId();
    return id ? (app.solves().find((s) => s.id === id) ?? null) : null;
  });

  const running = () => app.snapshot().phase === "solving";

  return (
    <div class="timer-page" classList={{ running: running() }}>
      <ConnectBar />
      <SessionBar />
      <ScrambleView />
      <div class="timer-grid">
        <TimeList />
        <div class="timer-center">
          <FlowDisplay />
          <Show when={!running() && shownSolve()}>{(s) => <LastAttemptCard solve={s()} />}</Show>
          <DevPanel />
        </div>
        <div class="timer-side">
          <StatsPanel />
        </div>
      </div>
    </div>
  );
}
