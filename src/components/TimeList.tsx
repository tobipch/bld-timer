import { createMemo, For, Show } from "solid-js";
import { formatMs } from "~/lib/stats";
import { useApp } from "~/state/app";

export function TimeList() {
  const app = useApp();
  const items = createMemo(() => {
    const xs = app.sessionSolves();
    return xs.map((s, i) => ({ s, n: i + 1 })).reverse();
  });

  return (
    <div class="timelist card">
      <h3>Times</h3>
      <Show when={items().length > 0} fallback={<span class="muted">No solves yet.</span>}>
        <ul>
          <For each={items()}>
            {({ s, n }) => (
              <li
                classList={{ selected: app.selectedSolveId() === s.id }}
                onClick={() => app.setSelectedSolveId(app.selectedSolveId() === s.id ? null : s.id)}
              >
                <span class="muted tl-n">{n}.</span>
                <span class={`mono tl-time ${s.result === "dnf" ? "bad" : ""}`}>
                  {s.result === "dnf" ? "DNF" : formatMs(s.totalMs)}
                </span>
                <span class="mono muted tl-split">
                  {s.execMs > 0 ? `${formatMs(s.memoMs)}+${formatMs(s.execMs)}` : ""}
                </span>
                <button
                  class="tl-del"
                  title="Delete solve"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm("Delete this solve?")) void app.deleteSolve(s.id);
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
