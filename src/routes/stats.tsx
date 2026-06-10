import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
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
  let chart: uPlot | null = null;

  const data = createMemo(() => {
    const xs = props.solves;
    const idx = xs.map((_, i) => i + 1);
    const ok = xs.map((s) => (s.result === "ok" ? s.totalMs / 1000 : null));
    const dnf = xs.map((s) => (s.result === "dnf" ? s.totalMs / 1000 : null));
    const memo = xs.map((s) => (s.execMs > 0 ? s.memoMs / 1000 : null));
    const ao12 = rollingAo12(xs);
    return [idx, ok, dnf, memo, ao12] as uPlot.AlignedData;
  });

  const css = (name: string) =>
    typeof getComputedStyle !== "undefined"
      ? getComputedStyle(document.documentElement).getPropertyValue(name).trim() || undefined
      : undefined;

  onMount(() => {
    const opts: uPlot.Options = {
      width: el.clientWidth || 800,
      height: 320,
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
    chart = new uPlot(opts, data(), el);
    const onResize = () => chart?.setSize({ width: el.clientWidth, height: 320 });
    window.addEventListener("resize", onResize);
    onCleanup(() => {
      window.removeEventListener("resize", onResize);
      chart?.destroy();
    });
  });

  createEffect(() => {
    chart?.setData(data());
  });

  return <div ref={el} class="trend-chart" />;
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

export default function StatsPage() {
  const app = useApp();
  const [newName, setNewName] = createSignal("");

  const sessionSolves = app.sessionSolves;
  const allSolves = createMemo(() => [...app.solves()].sort((a, b) => a.startedAt - b.startedAt));

  const pct = (xs: SolveRecord[]) => {
    const r = successRate(xs);
    return r === null ? "—" : `${Math.round(r * 100)}%`;
  };
  const splitStr = (xs: SolveRecord[]) => {
    const s = meanSplit(xs);
    return s ? `${formatMs(s.memo)} / ${formatMs(s.exec)}` : "—";
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
      </div>

      <div class="card">
        <h3>Time trend (session)</h3>
        <Show when={sessionSolves().length > 0} fallback={<span class="muted">No solves yet.</span>}>
          <TrendChart solves={sessionSolves()} />
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
    </div>
  );
}
