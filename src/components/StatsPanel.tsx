import { createMemo, For } from "solid-js";
import { aoN, bestAoN, bestSingle, boN, formatAvg, meanSplit, successRate, formatMs } from "~/lib/stats";
import { useApp } from "~/state/app";

export function StatsPanel() {
  const app = useApp();
  const rows = createMemo(() => {
    const xs = app.sessionSolves();
    const rate = successRate(xs);
    const split = meanSplit(xs);
    return [
      { k: "solves", v: `${xs.length}` },
      { k: "success", v: rate === null ? "—" : `${Math.round(rate * 100)}%` },
      { k: "best", v: formatAvg(bestSingle(xs)) },
      { k: "bo5", v: formatAvg(boN(xs, 5)) },
      { k: "ao5", v: formatAvg(aoN(xs, 5)) },
      { k: "best ao5", v: formatAvg(bestAoN(xs, 5)) },
      { k: "ao12", v: formatAvg(aoN(xs, 12)) },
      { k: "best ao12", v: formatAvg(bestAoN(xs, 12)) },
      { k: "mean memo", v: split ? formatMs(split.memo) : "—" },
      { k: "mean exec", v: split ? formatMs(split.exec) : "—" },
    ];
  });

  return (
    <div class="statspanel card">
      <h3>Stats</h3>
      <table>
        <tbody>
          <For each={rows()}>
            {(r) => (
              <tr>
                <td class="muted">{r.k}</td>
                <td class="mono">{r.v}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
}
