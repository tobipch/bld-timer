import { createMemo, createSignal, For, Show } from "solid-js";
import { aggregateCases, type CaseAgg } from "~/lib/algdb";
import { describePrimitive, letterFor, makeOrientationMaps, userStickerName } from "~/lib/engine/present";
import type { OrientationMaps } from "~/lib/engine/present";
import { formatMs } from "~/lib/stats";
import { settings } from "~/state/settings";
import { useApp } from "~/state/app";

type TypeFilter = "cornerComm" | "edgeComm" | "parity" | "ltct" | "flip" | "twist";

const TABS: { id: TypeFilter; label: string }[] = [
  { id: "edgeComm", label: "Edge comms" },
  { id: "cornerComm", label: "Corner comms" },
  { id: "parity", label: "Parity" },
  { id: "ltct", label: "LTCT" },
  { id: "flip", label: "Flips" },
  { id: "twist", label: "Twists" },
];

function commLetters(c: CaseAgg, maps: OrientationMaps): { buffer: string; l1: string; l2: string } | null {
  const p = c.primitive;
  if (p.type !== "cornerComm" && p.type !== "edgeComm") return null;
  return {
    buffer: userStickerName(p.buffer, maps),
    l1: letterFor(p.targets[0], settings.letterScheme, maps),
    l2: letterFor(p.targets[1], settings.letterScheme, maps),
  };
}

function CaseDetail(props: { c: CaseAgg }) {
  const app = useApp();
  const maps = createMemo(() => makeOrientationMaps(settings.orientation));
  const d = createMemo(() => describePrimitive(props.c.primitive, settings.letterScheme, maps()));
  return (
    <div class="case-detail card">
      <h3>
        {d().kind} — {d().label}
      </h3>
      <div class="muted">
        {props.c.count}× · avg {formatMs(props.c.avgExecMs)} · best {formatMs(props.c.bestExecMs)} · avg
        recognition {formatMs(props.c.avgRecogMs)}
      </div>
      <table class="case-variants">
        <thead>
          <tr>
            <th>alg (as executed)</th>
            <th>count</th>
            <th>avg</th>
            <th>best</th>
          </tr>
        </thead>
        <tbody>
          <For each={props.c.variants}>
            {(v) => (
              <tr>
                <td class="mono">{v.moves}</td>
                <td class="mono">{v.count}</td>
                <td class="mono">{formatMs(v.avgExecMs)}</td>
                <td class="mono">{formatMs(v.bestExecMs)}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
      <details>
        <summary class="muted">individual executions</summary>
        <ul class="case-execs">
          <For each={props.c.executions}>
            {(e) => (
              <li>
                <span class="mono">{formatMs(e.execMs)}</span>
                <span class="mono muted">rec {formatMs(e.recogMs)}</span>
                <span class="muted">{new Date(e.at).toLocaleDateString()}</span>
                <span class="mono case-exec-moves">{e.moves}</span>
                <button
                  class="tl-del"
                  title="Remove this execution from the database"
                  onClick={() => void app.deleteExecution(e.id)}
                >
                  ×
                </button>
              </li>
            )}
          </For>
        </ul>
      </details>
    </div>
  );
}

export default function AlgsPage() {
  const app = useApp();
  const [tab, setTab] = createSignal<TypeFilter>("edgeComm");
  const [buffer, setBuffer] = createSignal<string | null>(null);
  const [selectedKey, setSelectedKey] = createSignal<string | null>(null);

  const maps = createMemo(() => makeOrientationMaps(settings.orientation));
  const cases = createMemo(() => aggregateCases(app.executions()));
  const tabCases = createMemo(() => cases().filter((c) => c.primitive.type === tab()));

  const isComm = () => tab() === "edgeComm" || tab() === "cornerComm";
  const bufferNames = createMemo(() =>
    tab() === "edgeComm" ? settings.buffers.edges : settings.buffers.corners,
  );
  const activeBuffer = createMemo(() => buffer() ?? bufferNames()[0]);

  /** letters axis: the user's letters sorted, for the selected piece type */
  const letterAxis = createMemo(() => {
    const table = tab() === "edgeComm" ? settings.letterScheme.edges : settings.letterScheme.corners;
    return [...new Set(Object.values(table))].sort();
  });

  const matrix = createMemo(() => {
    const m = new Map<string, CaseAgg>();
    if (!isComm()) return m;
    for (const c of tabCases()) {
      const letters = commLetters(c, maps());
      if (letters && letters.buffer === activeBuffer()) m.set(`${letters.l1}|${letters.l2}`, c);
    }
    return m;
  });

  const selected = createMemo(() => cases().find((c) => c.caseKey === selectedKey()) ?? null);

  const slowest = createMemo(() =>
    [...tabCases()].filter((c) => c.count > 0).sort((a, b) => b.avgExecMs - a.avgExecMs).slice(0, 15),
  );

  return (
    <div class="algs-page">
      <div class="algs-tabs">
        <For each={TABS}>
          {(t) => (
            <button
              classList={{ "tab-active": tab() === t.id }}
              onClick={() => {
                setTab(t.id);
                setBuffer(null);
                setSelectedKey(null);
              }}
            >
              {t.label}
            </button>
          )}
        </For>
        <span class="muted algs-hint">learned from {app.executions().length} recorded executions</span>
      </div>

      <Show when={isComm()}>
        <div class="card">
          <div class="algs-bufferrow">
            <span class="muted">Buffer:</span>
            <For each={bufferNames()}>
              {(b) => (
                <button classList={{ "tab-active": activeBuffer() === b }} onClick={() => setBuffer(b)}>
                  {b}
                </button>
              )}
            </For>
          </div>
          <div class="matrix-wrap">
            <table class="alg-matrix">
              <thead>
                <tr>
                  <th class="muted" title="rows: first target, columns: second target">
                    1st\2nd
                  </th>
                  <For each={letterAxis()}>{(l) => <th>{l}</th>}</For>
                </tr>
              </thead>
              <tbody>
                <For each={letterAxis()}>
                  {(l1) => (
                    <tr>
                      <th>{l1}</th>
                      <For each={letterAxis()}>
                        {(l2) => {
                          const c = () => matrix().get(`${l1}|${l2}`);
                          return (
                            <td
                              classList={{
                                "cell-known": !!c(),
                                "cell-selected": !!c() && selectedKey() === c()!.caseKey,
                              }}
                              title={c() ? `${l1}${l2}: ${c()!.count}× avg ${formatMs(c()!.avgExecMs)}` : ""}
                              onClick={() => c() && setSelectedKey(c()!.caseKey)}
                            >
                              {c() ? (c()!.avgExecMs / 1000).toFixed(1) : ""}
                            </td>
                          );
                        }}
                      </For>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </div>
      </Show>

      <Show when={!isComm()}>
        <div class="card">
          <Show when={tabCases().length > 0} fallback={<span class="muted">Nothing learned yet — go solve!</span>}>
            <table class="case-list">
              <thead>
                <tr>
                  <th>case</th>
                  <th>count</th>
                  <th>avg</th>
                  <th>best</th>
                </tr>
              </thead>
              <tbody>
                <For each={[...tabCases()].sort((a, b) => b.count - a.count)}>
                  {(c) => {
                    const d = describePrimitive(c.primitive, settings.letterScheme, maps());
                    return (
                      <tr
                        classList={{ "cell-selected": selectedKey() === c.caseKey }}
                        onClick={() => setSelectedKey(c.caseKey)}
                      >
                        <td>{d.label}</td>
                        <td class="mono">{c.count}</td>
                        <td class="mono">{formatMs(c.avgExecMs)}</td>
                        <td class="mono">{formatMs(c.bestExecMs)}</td>
                      </tr>
                    );
                  }}
                </For>
              </tbody>
            </table>
          </Show>
        </div>
      </Show>

      <Show when={selected()}>{(c) => <CaseDetail c={c()} />}</Show>

      <Show when={isComm() && slowest().length > 0}>
        <div class="card">
          <h3>Slowest {TABS.find((t) => t.id === tab())!.label.toLowerCase()} (practice these)</h3>
          <table class="case-list">
            <tbody>
              <For each={slowest()}>
                {(c) => {
                  const d = describePrimitive(c.primitive, settings.letterScheme, maps());
                  return (
                    <tr onClick={() => setSelectedKey(c.caseKey)}>
                      <td>{d.label}</td>
                      <td class="mono">{c.count}×</td>
                      <td class="mono">{formatMs(c.avgExecMs)}</td>
                    </tr>
                  );
                }}
              </For>
            </tbody>
          </table>
        </div>
      </Show>
    </div>
  );
}
