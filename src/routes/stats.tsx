import { A } from "@solidjs/router";
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import type uPlotType from "uplot";
import { categoryIdsOf, dnfBreakdown, formatPct } from "~/lib/dnf";
import { exportSolvesMarkdown, solvesWithFeedback } from "~/lib/export";
import { aoN, bestAoN, bestSingle, boN, formatAvg, formatMs, meanSplit, successRate } from "~/lib/stats";
import type { SolveRecord } from "~/lib/storage/types";
import { settings, setSettings } from "~/state/settings";
import { useApp } from "~/state/app";

function rollingAo12(solves: SolveRecord[]): (number | null)[] {
  return solves.map((_, i) => {
    if (i + 1 < 12) return null;
    const a = aoN(solves.slice(0, i + 1), 12);
    return a.kind === "time" ? a.ms / 1000 : null;
  });
}

function TrendChart(props: { solves: SolveRecord[] }) {
  let el!: HTMLDivElement;
  let chart: uPlotType | null = null;
  const [failed, setFailed] = createSignal(false);
  let disposed = false;

  const data = createMemo(() => {
    const xs = props.solves;
    const idx = xs.map((_, i) => i + 1);
    const ok = xs.map((s) => (s.result === "ok" ? s.totalMs / 1000 : null));
    const dnf = xs.map((s) => (s.result === "dnf" ? s.totalMs / 1000 : null));
    const memo = xs.map((s) => (s.execMs > 0 ? s.memoMs / 1000 : null));
    const ao12 = rollingAo12(xs);
    return [idx, ok, dnf, memo, ao12] as uPlotType.AlignedData;
  });

  const css = (name: string) =>
    typeof getComputedStyle !== "undefined"
      ? getComputedStyle(document.documentElement).getPropertyValue(name).trim() || undefined
      : undefined;

  // loaded lazily and guarded: a charting hiccup must never take the whole
  // stats page down with it
  onMount(() => {
    // cleanup is registered synchronously: after an await the owner is gone
    const onResize = () => chart?.setSize({ width: el.clientWidth, height: 300 });
    window.addEventListener("resize", onResize);
    onCleanup(() => {
      disposed = true;
      window.removeEventListener("resize", onResize);
      chart?.destroy();
      chart = null;
    });
    void build();
  });

  async function build() {
    let uPlot: typeof uPlotType;
    try {
      await import("uplot/dist/uPlot.min.css");
      uPlot = (await import("uplot")).default;
    } catch (e) {
      console.error("chart unavailable:", e);
      setFailed(true);
      return;
    }
    const opts: uPlotType.Options = {
      width: el.clientWidth || 800,
      height: 300,
      scales: { x: { time: false } },
      axes: [
        { stroke: css("--text-dim"), grid: { stroke: css("--border") } },
        {
          stroke: css("--text-dim"),
          grid: { stroke: css("--border") },
          values: (_u, ticks) => ticks.map((v) => `${v}s`),
        },
      ],
      series: [
        { label: "#" },
        {
          label: "time",
          stroke: css("--accent"),
          width: 2,
          points: { show: true, size: 5 },
          value: (_u, v) => (v == null ? "" : formatMs(v * 1000)),
        },
        {
          label: "DNF",
          stroke: css("--bad"),
          paths: () => null,
          points: { show: true, size: 6 },
          value: (_u, v) => (v == null ? "" : `DNF ${formatMs(v * 1000)}`),
        },
        {
          label: "memo",
          stroke: css("--memo"),
          width: 1,
          dash: [4, 4],
          points: { show: false },
          value: (_u, v) => (v == null ? "" : formatMs(v * 1000)),
        },
        {
          label: "ao12",
          stroke: css("--good"),
          width: 2,
          points: { show: false },
          value: (_u, v) => (v == null ? "" : formatMs(v * 1000)),
        },
      ],
    };
    if (disposed) return;
    chart = new uPlot(opts, data(), el);
  }

  createEffect(() => {
    chart?.setData(data());
  });

  return (
    <>
      <div ref={el} class="trend-chart" />
      <Show when={failed()}>
        <span class="muted">The chart could not be loaded in this browser.</span>
      </Show>
    </>
  );
}

function StatRow(props: { label: string; session: string; allTime: string }) {
  return (
    <tr>
      <td class="muted">{props.label}</td>
      <td class="mono">{props.session}</td>
      <td class="mono">{props.allTime}</td>
    </tr>
  );
}

/** Rate, split by reason — the two numbers the old DNF tracker never had together. */
function FailureAnalysis(props: { solves: SolveRecord[] }) {
  const app = useApp();
  const stats = createMemo(() => dnfBreakdown(props.solves, app.dnfCategories()));
  const untagged = createMemo(() =>
    props.solves
      .filter((s) => s.result === "dnf" && categoryIdsOf(s).length === 0)
      .sort((a, b) => b.startedAt - a.startedAt),
  );

  return (
    <div class="card failure-card">
      <h3>Failure analysis</h3>
      <Show when={stats().total > 0} fallback={<span class="muted">No solves yet.</span>}>
        <div class="failure-top">
          <div class="failure-big">
            <span class="failure-value mono">{formatPct(stats().dnfRate)}</span>
            <span class="muted">DNF rate</span>
          </div>
          <div class="failure-big">
            <span class="failure-value mono good">{formatPct(stats().successRate)}</span>
            <span class="muted">success</span>
          </div>
          <div class="failure-big">
            <span class="failure-value mono">
              {stats().dnf}
              <span class="muted">/{stats().total}</span>
            </span>
            <span class="muted">DNFs / solves</span>
          </div>
        </div>

        <div class="dnf-bar big" title="every solve, coloured by outcome">
          <For each={stats().rows}>
            {(r) => (
              <span
                class="dnf-bar-seg"
                style={{ width: `${r.barShare * 100}%`, background: r.category?.color ?? "var(--border)" }}
                title={`${r.category?.name ?? "untagged"}: ${r.count}`}
              />
            )}
          </For>
          <span class="dnf-bar-seg ok" style={{ width: `${(stats().ok / stats().total) * 100}%` }} />
        </div>

        <Show when={stats().dnf > 0}>
          <table class="stats-table failure-table">
            <thead>
              <tr>
                <th>reason</th>
                <th>DNFs</th>
                <th>of all DNFs</th>
                <th>of all solves</th>
                <th />
              </tr>
            </thead>
            <tbody>
              <For each={stats().rows}>
                {(r) => (
                  <tr>
                    <td>
                      <span class="cat-dot" style={{ background: r.category?.color ?? "var(--border)" }} />
                      {r.category?.name ?? <span class="muted">untagged</span>}
                    </td>
                    <td class="mono">{r.count}</td>
                    <td class="mono">{formatPct(r.ofDnf)}</td>
                    <td class="mono">{formatPct(r.ofAll)}</td>
                    <td class="failure-spark">
                      <span
                        style={{
                          width: `${r.ofDnf * 100}%`,
                          background: r.category?.color ?? "var(--border)",
                        }}
                      />
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
          <Show when={stats().multiTagged}>
            <p class="muted table-note">
              A DNF can carry several reasons, so "of all DNFs" adds up to more than 100%.
            </p>
          </Show>
        </Show>

        <Show when={untagged().length > 0}>
          <div class="untagged-row">
            <span class="warn">{untagged().length} DNF(s) without a reason</span>
            <For each={untagged().slice(0, 8)}>
              {(s) => (
                <A class="untagged-link mono" href={`/solve/${s.id}`}>
                  {new Date(s.startedAt).toLocaleDateString()} ▶
                </A>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  );
}

function CategoryManager() {
  const app = useApp();
  const [name, setName] = createSignal("");

  return (
    <div class="card cat-manager">
      <h3>DNF categories</h3>
      <ul class="cat-list">
        <For each={app.dnfCategories()}>
          {(c) => (
            <li>
              <input
                type="color"
                value={c.color}
                onChange={(e) => void app.updateDnfCategory(c.id, { color: e.currentTarget.value })}
              />
              <input
                class="cat-name"
                value={c.name}
                onChange={(e) => {
                  const v = e.currentTarget.value.trim();
                  if (v) void app.updateDnfCategory(c.id, { name: v });
                  else e.currentTarget.value = c.name;
                }}
              />
              <button
                class="danger"
                title="Delete — solves tagged with it become untagged"
                onClick={() => {
                  if (confirm(`Delete "${c.name}"? Solves tagged with it lose their tag.`))
                    void app.deleteDnfCategory(c.id);
                }}
              >
                ×
              </button>
            </li>
          )}
        </For>
      </ul>
      <form
        class="cat-add"
        onSubmit={(e) => {
          e.preventDefault();
          const v = name().trim();
          if (!v) return;
          void app.addDnfCategory(v, "#4da3ff");
          setName("");
        }}
      >
        <input placeholder="new category" value={name()} onInput={(e) => setName(e.currentTarget.value)} />
        <button type="submit">Add</button>
      </form>
    </div>
  );
}

export default function StatsPage() {
  const app = useApp();
  const [newName, setNewName] = createSignal("");
  const [scope, setScope] = createSignal<"session" | "all">("session");

  const sessionSolves = app.sessionSolves;
  const allSolves = createMemo(() => [...app.solves()].sort((a, b) => a.startedAt - b.startedAt));
  const scoped = createMemo(() => (scope() === "session" ? sessionSolves() : allSolves()));

  const pct = (xs: SolveRecord[]) => {
    const r = successRate(xs);
    return r === null ? "—" : `${Math.round(r * 100)}%`;
  };
  const splitStr = (xs: SolveRecord[]) => {
    const s = meanSplit(xs);
    return s ? `${formatMs(s.memo)} / ${formatMs(s.exec)}` : "—";
  };

  const exportMd = () => {
    const picked = solvesWithFeedback(app.solves());
    const md = exportSolvesMarkdown(picked, settings.letterScheme, settings.orientation, app.dnfCategories());
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bld-solves-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div class="stats-page">
      <div class="card stats-header">
        <label>
          Session{" "}
          <select
            value={settings.sessionId ?? ""}
            onChange={(e) => setSettings("sessionId", e.currentTarget.value)}
          >
            <For each={app.sessions()}>{(s) => <option value={s.id}>{s.name}</option>}</For>
          </select>
        </label>
        <div class="scope-toggle">
          <button classList={{ active: scope() === "session" }} onClick={() => setScope("session")}>
            this session
          </button>
          <button classList={{ active: scope() === "all" }} onClick={() => setScope("all")}>
            all time
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (newName().trim()) {
              void app.addSession(newName().trim());
              setNewName("");
            }
          }}
        >
          <input
            placeholder="new session name"
            value={newName()}
            onInput={(e) => setNewName(e.currentTarget.value)}
          />
          <button type="submit">Add</button>
        </form>
        <button onClick={exportMd} title="Markdown export of every solve with a note or a DNF category">
          Export notes
        </button>
      </div>

      <FailureAnalysis solves={scoped()} />

      <div class="card">
        <h3>Time trend <span class="muted">({scope() === "session" ? "session" : "all time"})</span></h3>
        <Show when={scoped().length > 0} fallback={<span class="muted">No solves yet.</span>}>
          <TrendChart solves={scoped()} />
        </Show>
      </div>

      <div class="card">
        <h3>Numbers</h3>
        <table class="stats-table">
          <thead>
            <tr>
              <th />
              <th>session</th>
              <th>all time</th>
            </tr>
          </thead>
          <tbody>
            <StatRow label="solves" session={`${sessionSolves().length}`} allTime={`${allSolves().length}`} />
            <StatRow label="success rate" session={pct(sessionSolves())} allTime={pct(allSolves())} />
            <StatRow
              label="best single"
              session={formatAvg(bestSingle(sessionSolves()))}
              allTime={formatAvg(bestSingle(allSolves()))}
            />
            <StatRow
              label="bo5 (current)"
              session={formatAvg(boN(sessionSolves(), 5))}
              allTime={formatAvg(boN(allSolves(), 5))}
            />
            <StatRow
              label="ao5 (current)"
              session={formatAvg(aoN(sessionSolves(), 5))}
              allTime={formatAvg(aoN(allSolves(), 5))}
            />
            <StatRow
              label="ao5 (best)"
              session={formatAvg(bestAoN(sessionSolves(), 5))}
              allTime={formatAvg(bestAoN(allSolves(), 5))}
            />
            <StatRow
              label="ao12 (current)"
              session={formatAvg(aoN(sessionSolves(), 12))}
              allTime={formatAvg(aoN(allSolves(), 12))}
            />
            <StatRow
              label="ao12 (best)"
              session={formatAvg(bestAoN(sessionSolves(), 12))}
              allTime={formatAvg(bestAoN(allSolves(), 12))}
            />
            <StatRow
              label="mean memo / exec"
              session={splitStr(sessionSolves())}
              allTime={splitStr(allSolves())}
            />
          </tbody>
        </table>
      </div>

      <CategoryManager />
    </div>
  );
}
