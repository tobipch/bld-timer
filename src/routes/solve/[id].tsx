import { A, useNavigate, useParams } from "@solidjs/router";
import { createMemo, createSignal, For, Show } from "solid-js";
import { DnfPicker } from "~/components/DnfPicker";
import { ReconstructionView } from "~/components/ReconstructionView";
import { SolveNotes } from "~/components/SolveNotes";
import { SolvePlayer } from "~/components/SolvePlayer";
import { categoriesOf } from "~/lib/dnf";
import { buildReplay, tpsAt } from "~/lib/replay";
import { formatMs } from "~/lib/stats";
import { settings } from "~/state/settings";
import { useApp } from "~/state/app";

function Metric(props: { label: string; value: string; hint?: string }) {
  return (
    <div class="metric" title={props.hint}>
      <dt>{props.label}</dt>
      <dd class="mono">{props.value}</dd>
    </div>
  );
}

export default function SolvePage() {
  const app = useApp();
  const params = useParams();
  const navigate = useNavigate();
  const [showEngine, setShowEngine] = createSignal(false);

  const solve = createMemo(() => app.solves().find((s) => s.id === params.id) ?? null);
  const model = createMemo(() => buildReplay(solve() ?? { scramble: "", moves: [] }, settings.orientation));
  const tps = createMemo(() => tpsAt(model(), model().moves.length, solve()?.execMs ?? 0));
  const number = createMemo(() => {
    const s = solve();
    if (!s) return null;
    const idx = app.solves()
      .filter((x) => x.sessionId === s.sessionId)
      .sort((a, b) => a.startedAt - b.startedAt)
      .findIndex((x) => x.id === s.id);
    return idx >= 0 ? idx + 1 : null;
  });

  return (
    <div class="solve-page">
      <Show
        when={solve()}
        fallback={
          <div class="card">
            <p class="muted">
              {app.solves().length === 0 ? "Loading…" : "This solve no longer exists."}{" "}
              <A href="/">Back to the timer</A>
            </p>
          </div>
        }
      >
        {(s) => (
          <>
            <div class="card solve-head">
              <div class="solve-head-top">
                <A href="/" class="back-link">
                  ← Timer
                </A>
                <h2 class="mono">
                  <Show when={number()}>{(n) => <span class="muted">#{n()} </span>}</Show>
                  <span classList={{ bad: s().result === "dnf", good: s().result === "ok" }}>
                    {s().result === "dnf" ? "DNF" : formatMs(s().totalMs)}
                  </span>
                </h2>
                <div class="solve-head-right">
                  <button
                    onClick={() => void app.setSolveResult(s().id, s().result === "ok" ? "dnf" : "ok")}
                    title="The cube decides this automatically — override it if the cube was out of sync"
                  >
                    mark as {s().result === "ok" ? "DNF" : "OK"}
                  </button>
                  <button
                    class="danger"
                    onClick={() => {
                      if (confirm("Delete this solve?")) {
                        void app.deleteSolve(s().id);
                        navigate("/");
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>

              <dl class="metric-strip">
                <Metric label="memo" value={formatMs(s().memoMs)} />
                <Metric label="exec" value={formatMs(s().execMs)} />
                <Metric
                  label="thinking"
                  value={formatMs(model().pauseTotalMs)}
                  hint="time standing still between algs during the execution"
                />
                <Metric label="moves" value={`${model().moves.length}`} hint="R2 counts as one move" />
                <Metric
                  label="algs"
                  value={`${model().bursts.length}`}
                  hint="runs of moves separated by a pause"
                />
                <Metric
                  label="tps"
                  value={tps() === null ? "—" : tps()!.toFixed(2)}
                  hint="moves per second over the whole execution"
                />
              </dl>

              <div class="solve-head-scramble">
                <span class="muted">scramble</span>
                <code class="mono">{s().scramble}</code>
              </div>
            </div>

            <Show when={s().result === "dnf"}>
              <div class="card dnf-card">
                <div class="dnf-card-head">
                  <h4>Why did it fail?</h4>
                  <For each={categoriesOf(s(), app.dnfCategories())}>
                    {(c) => (
                      <span class="dnf-current" style={{ "--chip": c.color }}>
                        {c.name}
                      </span>
                    )}
                  </For>
                  <span class="muted dnf-card-hint">pick as many as apply</span>
                </div>
                <DnfPicker solve={s()} />
                <SolveNotes solve={s()} />
              </div>
            </Show>
            <Show when={s().result === "ok"}>
              <div class="card dnf-card">
                <SolveNotes solve={s()} />
              </div>
            </Show>

            <SolvePlayer solve={s()} />

            <div class="card engine-card">
              <button class="engine-toggle" onClick={() => setShowEngine((v) => !v)}>
                {showEngine() ? "▾" : "▸"} Automatic analysis <span class="muted">(experimental — a guess, not a verdict)</span>
              </button>
              <Show when={showEngine()}>
                <ReconstructionView
                  rec={s().reconstruction}
                  scramble={s().scramble}
                  moves={s().moves}
                  compact
                  title=""
                />
              </Show>
            </div>
          </>
        )}
      </Show>
    </div>
  );
}
