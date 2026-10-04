import { createMemo, For, Show } from "solid-js";
import { holdFaceMap, IDENTITY_FACE_MAP } from "~/lib/cube/orientation";
import { settings } from "~/state/settings";
import { useApp } from "~/state/app";

/** Done moves green, current bold, pending plain, corrections red. */
export function ScrambleView() {
  const app = useApp();
  const frame = createMemo(
    () => holdFaceMap(settings.topColor, settings.frontColor) ?? IDENTITY_FACE_MAP,
  );

  const display = createMemo(() => {
    const snap = app.snapshot();
    if (!snap.follower) return null;
    return snap.follower.display(frame());
  });

  const waitingText = () => {
    const phase = app.snapshot().phase;
    if (phase === "awaitSolved") return "Solve the cube";
    if (phase === "scrambling" && app.scrambleLoading()) return "…";
    return null;
  };

  return (
    <Show
      when={display()}
      fallback={
        <Show when={waitingText()}>
          {(t) => <div class="scramble card muted">{t()}</div>}
        </Show>
      }
    >
      {(d) => (
        <div class="scramble card">
          <div class="scramble-tokens">
            <For each={d().tokens}>{(t) => <span class={`tok tok-${t.status}`}>{t.text}</span>}</For>
          </div>
          <Show when={d().corrections.length > 0}>
            <div class="scramble-corrections">
              <For each={d().corrections}>{(c) => <span class="tok tok-correction">{c}</span>}</For>
            </div>
          </Show>
        </div>
      )}
    </Show>
  );
}
