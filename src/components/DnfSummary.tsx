import { A } from "@solidjs/router";
import { createMemo, For, Show } from "solid-js";
import { dnfBreakdown, formatPct } from "~/lib/dnf";
import { useApp } from "~/state/app";

/** Compact "how am I failing" panel for the timer page. */
export function DnfSummary() {
  const app = useApp();
  const stats = createMemo(() => dnfBreakdown(app.sessionSolves(), app.dnfCategories()));

  return (
    <div class="dnf-summary card">
      <h3>DNFs</h3>
      <Show when={stats().total > 0} fallback={<span class="muted">No solves yet.</span>}>
        <div class="dnf-rate">
          <span class="dnf-rate-value mono" classList={{ bad: (stats().dnfRate ?? 0) > 0.3 }}>
            {formatPct(stats().dnfRate)}
          </span>
          <span class="muted">
            {stats().dnf} of {stats().total}
          </span>
        </div>
        <div class="dnf-bar" title="share of all solves">
          <For each={stats().rows}>
            {(r) => (
              <span
                class="dnf-bar-seg"
                style={{ width: `${r.ofAll * 100}%`, background: r.category?.color ?? "var(--border)" }}
                title={`${r.category?.name ?? "untagged"}: ${r.count}`}
              />
            )}
          </For>
          <span class="dnf-bar-seg ok" style={{ width: `${(stats().ok / stats().total) * 100}%` }} />
        </div>
        <ul class="dnf-legend">
          <For each={stats().rows.slice(0, 4)}>
            {(r) => (
              <li>
                <i style={{ background: r.category?.color ?? "var(--border)" }} />
                <span class="dnf-legend-name">{r.category?.name ?? "untagged"}</span>
                <span class="mono muted">{r.count}</span>
              </li>
            )}
          </For>
        </ul>
        <A href="/stats" class="muted dnf-more">
          full breakdown →
        </A>
      </Show>
    </div>
  );
}
