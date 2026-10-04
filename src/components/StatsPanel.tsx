import { createMemo, For } from "solid-js";
import {
  aoN,
  bestAoN,
  bestSingle,
  formatAvg,
  formatPct,
  scoresOf,
  successRate,
  type AvgResult,
} from "~/lib/stats";
import { settings } from "~/state/settings";
import { useApp } from "~/state/app";

const AVERAGES = [5, 12, 50, 100];

export function StatsPanel() {
  const app = useApp();
  const values = createMemo(() => scoresOf(app.sessionSolves(), settings.flow));

  const rows = createMemo(() => {
    const vs = values();
    const last: AvgResult = vs.length > 0 ? { kind: "flow", value: vs[vs.length - 1] } : { kind: "none" };
    return [
      { k: "single", current: formatAvg(last), best: formatAvg(bestSingle(vs)) },
      ...AVERAGES.map((n) => ({
        k: `ao${n}`,
        current: formatAvg(aoN(vs, n)),
        best: formatAvg(bestAoN(vs, n)),
      })),
    ];
  });

  return (
    <div class="statspanel card">
      <table>
        <tbody>
          <tr>
            <td class="muted">attempts</td>
            <td class="mono" colSpan={2}>
              {app.sessionSolves().length}
            </td>
          </tr>
          <tr>
            <td class="muted">success</td>
            <td class="mono" colSpan={2}>
              {formatPct(successRate(app.sessionSolves()))}
            </td>
          </tr>
        </tbody>
      </table>
      <table class="stats-avgs">
        <thead>
          <tr>
            <th />
            <th>current</th>
            <th>best</th>
          </tr>
        </thead>
        <tbody>
          <For each={rows()}>
            {(r) => (
              <tr>
                <td class="muted">{r.k}</td>
                <td class="mono">{r.current}</td>
                <td class="mono">{r.best}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
}
