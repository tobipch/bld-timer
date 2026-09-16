import { createMemo, For, Show } from "solid-js";
import { formatFlow } from "~/lib/flow";
import { flowOf, formatMs } from "~/lib/stats";
import { settings } from "~/state/settings";
import { useApp } from "~/state/app";

export function TimeList() {
  const app = useApp();
  const items = createMemo(() =>
    app
      .sessionSolves()
      .map((s, i) => ({ s, n: i + 1, flow: flowOf(s, settings.flow) }))
      .reverse(),
  );

  return (
    <div class="timelist card">
      <h3>Attempts</h3>
      <Show when={items().length > 0} fallback={<span class="muted">Nothing yet.</span>}>
        <ul>
          <For each={items()}>
            {({ s, n, flow }) => (
              <li
                classList={{ selected: app.selectedSolveId() === s.id }}
                onClick={() => app.setSelectedSolveId(app.selectedSolveId() === s.id ? null : s.id)}
              >
                <span class="muted tl-n">{n}.</span>
                <span class="mono tl-time" classList={{ bad: s.result === "dnf" }}>
                  {formatFlow(flow.flow)}
                </span>
                <span class="mono muted tl-split">
                  {flow.pauses}p · {formatMs(flow.execMs)}
                </span>
                <Show when={s.result === "dnf"}>
                  <span class="tl-dnf bad">DNF</span>
                </Show>
                <button
                  class="tl-del"
                  title={s.result === "dnf" ? "Count as solved after all" : "Mark as DNF"}
                  onClick={(e) => {
                    e.stopPropagation();
                    void app.updateSolve(s.id, s.result === "dnf" ? "ok" : "dnf");
                  }}
                >
                  {s.result === "dnf" ? "✓" : "✗"}
                </button>
                <button
                  class="tl-del"
                  title="Delete attempt"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm("Delete this attempt?")) void app.deleteSolve(s.id);
                  }}
                >
                  ×
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
}
