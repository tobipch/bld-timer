import { onCleanup, onMount } from "solid-js";
import { ConnectBar } from "~/components/ConnectBar";
import { DevPanel } from "~/components/DevPanel";
import { FlowDisplay } from "~/components/FlowDisplay";
import { ScrambleView } from "~/components/ScrambleView";
import { StatsPanel } from "~/components/StatsPanel";
import { TimeList } from "~/components/TimeList";
import { useApp } from "~/state/app";

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

  const running = () => app.snapshot().phase === "solving";

  return (
    <div class="timer-page" classList={{ running: running() }}>
      <ConnectBar />
      <ScrambleView />
      <div class="timer-grid">
        <div>
          <TimeList />
        </div>
        <div class="timer-center">
          <FlowDisplay />
          <DevPanel />
        </div>
        <div class="timer-side">
          <StatsPanel />
        </div>
      </div>
    </div>
  );
}
