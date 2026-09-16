import { createMemo, For } from "solid-js";
import { aoN, bestAoN, bestSingle, formatAvg, formatPct, scoresOf, successRate } from "~/lib/stats";
import { settings } from "~/state/settings";
import { useApp } from "~/state/app";

export function StatsPanel() {
  const app = useApp();
  const rows = createMemo(() => {
    const xs = app.sessionSolves();
    const values = scoresOf(xs, settings.flow);
    return [
      { k: "attempts", v: `${xs.length}` },
      { k: "success", v: formatPct(successRate(xs)) },
      { k: "best", v: formatAvg(bestSingle(values)) },
      { k: "ao5", v: formatAvg(aoN(values, 5)) },
      { k: "best ao5", v: formatAvg(bestAoN(values, 5)) },
      { k: "ao12", v: formatAvg(aoN(values, 12)) },
      { k: "best ao12", v: formatAvg(bestAoN(values, 12)) },
      { k: "ao50", v: formatAvg(aoN(values, 50)) },
      { k: "ao100", v: formatAvg(aoN(values, 100)) },
    ];
  });

  return (
    <div class="statspanel card">
      <h3>Flow</h3>
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
