import { createMemo, For, Show } from "solid-js";
import { useApp } from "~/state/app";

/**
 * Scramble follow-along: done moves green, current bold, pending orange,
 * corrections red — as in ltct-trainer.
 */
export function ScrambleView() {
  const app = useApp();
  const display = createMemo(() => {
    const snap = app.snapshot();
    if (!snap.follower) return null;
    return snap.follower.display();
  });

  const waitingText = () => {
    const phase = app.snapshot().phase;
    if (!app.cube()) return "Connect a cube to start.";
    if (phase === "awaitSolved") return "Solve the cube to start the next scramble.";
    if (phase === "memo") return "Memorising — first turn starts the execution.";
    if (phase === "exec") return "Go. Space stops the timer.";
    return app.scrambleLoading() ? "Generating scramble…" : "Waiting for scramble…";
  };

  return (
    <div class="scramble card">
      <Show when={display()} fallback={<span class="muted">{waitingText()}</span>}>
        {(d) => (
          <>
            <div class="scramble-tokens">
              <For each={d().tokens}>
                {(t) => <span class={`tok tok-${t.status}`}>{t.text}</span>}
              </For>
            </div>
            <Show when={d().corrections.length > 0}>
              <div class="scramble-corrections">
                undo: <For each={d().corrections}>{(c) => <span class="tok tok-correction">{c}</span>}</For>
              </div>
            </Show>
          </>
        )}
      </Show>
    </div>
  );
}
