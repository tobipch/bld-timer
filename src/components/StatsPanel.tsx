import { createMemo, For } from "solid-js";
import { aoN, bestSingle, formatAvg, formatPct, scoresOf, successRate } from "~/lib/stats";
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
      { k: "ao12", v: formatAvg(aoN(values, 12)) },
    ];
  });

  return (
    <div class="statspanel card">
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
