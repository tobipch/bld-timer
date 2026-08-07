import { A } from "@solidjs/router";
import { createMemo, For, Show } from "solid-js";
import { categoryOf } from "~/lib/dnf";
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
            {({ s, n }) => {
              const cat = createMemo(() => categoryOf(s, app.dnfCategories()));
              return (
                <li
                  classList={{ selected: app.selectedSolveId() === s.id }}
                  onClick={() => app.setSelectedSolveId(app.selectedSolveId() === s.id ? null : s.id)}
                >
                  <span class="muted tl-n">{n}.</span>
                  <span class={`mono tl-time ${s.result === "dnf" ? "bad" : ""}`}>
                    {s.result === "dnf" ? "DNF" : formatMs(s.totalMs)}
                  </span>
                  <Show
                    when={s.result === "dnf"}
                    fallback={
                      <span class="mono muted tl-split">
                        {s.execMs > 0 ? `${formatMs(s.memoMs)}+${formatMs(s.execMs)}` : ""}
                      </span>
                    }
                  >
                    <span
                      class="tl-cat"
                      classList={{ untagged: !cat() }}
                      style={cat() ? { "--chip": cat()!.color } : undefined}
                      title={cat()?.name ?? "not categorised yet"}
                    >
                      {cat()?.name ?? "?"}
                    </span>
                  </Show>
                  <A
                    class="tl-play"
                    href={`/solve/${s.id}`}
                    title="Open the replay"
                    onClick={(e) => e.stopPropagation()}
                  >
                    ▶
                  </A>
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
              );
            }}
          </For>
        </ul>
      </Show>
    </div>
  );
}
