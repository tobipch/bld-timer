import { createEffect, createMemo, createSignal, onCleanup, onMount, Show } from "solid-js";
import type uPlotType from "uplot";
import { MODE_LABEL } from "~/lib/scramble";
import {
  aoN,
  bestAoN,
  bestSingle,
  formatAvg,
  formatPct,
  rollingAoN,
  scoresOf,
  successRate,
} from "~/lib/stats";
import type { SolveRecord } from "~/lib/storage/types";
import { settings } from "~/state/settings";
import { useApp } from "~/state/app";

const pct = (v: number | null) => (v === null ? null : v * 100);

function TrendChart(props: { solves: SolveRecord[] }) {
  let el!: HTMLDivElement;
  let chart: uPlotType | null = null;
  const [failed, setFailed] = createSignal(false);
  let disposed = false;

  const data = createMemo(() => {
    const values = scoresOf(props.solves, settings.flow);
    const idx = values.map((_, i) => i + 1);
    const single = values.map((v) => v * 100);
    const ao5 = rollingAoN(values, 5).map(pct);
    const ao12 = rollingAoN(values, 12).map(pct);
    return [idx, single, ao5, ao12] as uPlotType.AlignedData;
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
    const value = (_u: uPlotType, v: number | null) => (v == null ? "" : `${v.toFixed(1)}%`);
    const opts: uPlotType.Options = {
      width: el.clientWidth || 800,
      height: 300,
      scales: { x: { time: false }, y: { range: [0, 100] } },
      axes: [
        { stroke: css("--text-dim"), grid: { stroke: css("--border") } },
        {
          stroke: css("--text-dim"),
          grid: { stroke: css("--border") },
          values: (_u, ticks) => ticks.map((v) => `${v}%`),
        },
      ],
      series: [
        { label: "#" },
        {
          label: "flow",
          stroke: css("--accent"),
          width: 1,
          points: { show: true, size: 4 },
          value,
        },
        { label: "ao5", stroke: css("--warn"), width: 2, points: { show: false }, value },
        { label: "ao12", stroke: css("--good"), width: 2, points: { show: false }, value },
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

function StatRow(props: { label: string; session: string; mode: string }) {
  return (
    <tr>
      <td class="muted">{props.label}</td>
      <td class="mono">{props.session}</td>
      <td class="mono">{props.mode}</td>
    </tr>
  );
}

export default function StatsPage() {
  const app = useApp();
  const [scope, setScope] = createSignal<"session" | "mode">("session");

  const scoped = createMemo(() => (scope() === "session" ? app.sessionSolves() : app.modeSolves()));
  const scopedValues = createMemo(() => scoresOf(scoped(), settings.flow));

  const sessionValues = createMemo(() => scoresOf(app.sessionSolves(), settings.flow));
  const modeValues = createMemo(() => scoresOf(app.modeSolves(), settings.flow));

  const both = (f: (values: number[]) => string) => ({
    session: f(sessionValues()),
    mode: f(modeValues()),
  });

  const avg = (n: number) => both((values) => formatAvg(aoN(values, n)));
  const best = (n: number) => both((values) => formatAvg(bestAoN(values, n)));

  return (
    <div class="stats-page">
      <div class="card stats-header">
        <span class="stats-title">
          {MODE_LABEL[app.mode()]} · {app.currentSession()?.name ?? "—"}
        </span>
        <div class="scope-toggle">
          <button classList={{ active: scope() === "session" }} onClick={() => setScope("session")}>
            this session
          </button>
          <button classList={{ active: scope() === "mode" }} onClick={() => setScope("mode")}>
            all {MODE_LABEL[app.mode()].toLowerCase()}
          </button>
        </div>
        <span class="muted">Sessions are switched on the timer page.</span>
      </div>

      <div class="card">
        <h3>Success</h3>
        <div class="stat-tiles">
          <div class="stat-tile">
            <span class="stat-value mono good">{formatPct(successRate(scoped()))}</span>
            <span class="muted">success rate</span>
          </div>
          <div class="stat-tile">
            <span class="stat-value mono">
              {scoped().filter((s) => s.result === "ok").length}
              <span class="muted">/{scoped().length}</span>
            </span>
            <span class="muted">solved / attempts</span>
          </div>
          <div class="stat-tile">
            <span class="stat-value mono">{formatAvg(aoN(scopedValues(), 5))}</span>
            <span class="muted">current ao5</span>
          </div>
          <div class="stat-tile">
            <span class="stat-value mono">{formatAvg(bestSingle(scopedValues()))}</span>
            <span class="muted">best single</span>
          </div>
        </div>
        <p class="muted table-note">
          Flow and success are two separate numbers on purpose: a failed attempt still scores the
          flow of the execution it did have, so the averages say how fluently you turn and the
          success rate says how often it worked.
        </p>
      </div>

      <div class="card">
        <h3>
          Flow over time{" "}
          <span class="muted">({scope() === "session" ? "this session" : "all sessions"})</span>
        </h3>
        <Show when={scoped().length > 0} fallback={<span class="muted">Nothing yet.</span>}>
          <TrendChart solves={scoped()} />
          <p class="muted table-note">Every attempt, with the rolling ao5 and ao12.</p>
        </Show>
      </div>

      <div class="card">
        <h3>Numbers</h3>
        <table class="stats-table">
          <thead>
            <tr>
              <th />
              <th>session</th>
              <th>all {MODE_LABEL[app.mode()].toLowerCase()}</th>
            </tr>
          </thead>
          <tbody>
            <StatRow
              label="attempts"
              session={`${app.sessionSolves().length}`}
              mode={`${app.modeSolves().length}`}
            />
            <StatRow
              label="success rate"
              session={formatPct(successRate(app.sessionSolves()))}
              mode={formatPct(successRate(app.modeSolves()))}
            />
            <StatRow label="best single" {...both((v) => formatAvg(bestSingle(v)))} />
            <StatRow label="ao5 (current)" {...avg(5)} />
            <StatRow label="ao12 (current)" {...avg(12)} />
            <StatRow label="ao50 (current)" {...avg(50)} />
            <StatRow label="ao100 (current)" {...avg(100)} />
            <StatRow label="ao5 (best)" {...best(5)} />
            <StatRow label="ao12 (best)" {...best(12)} />
            <StatRow label="ao50 (best)" {...best(50)} />
            <StatRow label="ao100 (best)" {...best(100)} />
          </tbody>
        </table>
      </div>
    </div>
  );
}
