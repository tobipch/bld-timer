import { createEffect, createMemo, createSignal, onCleanup, onMount, Show } from "solid-js";
import type uPlotType from "uplot";
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

function StatRow(props: { label: string; value: string }) {
  return (
    <tr>
      <td class="muted">{props.label}</td>
      <td class="mono">{props.value}</td>
    </tr>
  );
}

export default function StatsPage() {
  const app = useApp();
  const solves = () => app.sessionSolves();
  const values = createMemo(() => scoresOf(solves(), settings.flow));

  return (
    <div class="stats-page">
      <div class="card">
        <h3>{app.currentSession()?.name ?? "—"}</h3>
        <div class="stat-tiles">
          <div class="stat-tile">
            <span class="stat-value mono good">{formatPct(successRate(solves()))}</span>
            <span class="muted">success</span>
          </div>
          <div class="stat-tile">
            <span class="stat-value mono">
              {solves().filter((s) => s.result === "ok").length}
              <span class="muted">/{solves().length}</span>
            </span>
            <span class="muted">solved</span>
          </div>
          <div class="stat-tile">
            <span class="stat-value mono">{formatAvg(aoN(values(), 5))}</span>
            <span class="muted">ao5</span>
          </div>
          <div class="stat-tile">
            <span class="stat-value mono">{formatAvg(bestSingle(values()))}</span>
            <span class="muted">best</span>
          </div>
        </div>
      </div>

      <Show when={solves().length > 0}>
        <div class="card">
          <TrendChart solves={solves()} />
        </div>

        <div class="card">
          <table class="stats-table">
            <tbody>
              <StatRow label="ao5" value={formatAvg(aoN(values(), 5))} />
              <StatRow label="ao12" value={formatAvg(aoN(values(), 12))} />
              <StatRow label="ao50" value={formatAvg(aoN(values(), 50))} />
              <StatRow label="ao100" value={formatAvg(aoN(values(), 100))} />
              <StatRow label="best ao5" value={formatAvg(bestAoN(values(), 5))} />
              <StatRow label="best ao12" value={formatAvg(bestAoN(values(), 12))} />
              <StatRow label="best ao50" value={formatAvg(bestAoN(values(), 50))} />
              <StatRow label="best ao100" value={formatAvg(bestAoN(values(), 100))} />
            </tbody>
          </table>
        </div>
      </Show>
    </div>
  );
}
