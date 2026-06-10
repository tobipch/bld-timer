import { createMemo, For, Show } from "solid-js";
import { cornerStickerByName, edgeStickerByName } from "~/lib/cube/geometry";
import { SPEFFZ_CORNERS, SPEFFZ_EDGES } from "~/lib/cube/speffz";
import { resetLetterScheme, settings, setSettings } from "~/state/settings";

/** Sticker names in Speffz letter order, the same layout as the alg sheets. */
const CORNER_ORDER = Object.keys(SPEFFZ_CORNERS);
const EDGE_ORDER = Object.keys(SPEFFZ_EDGES);

function SchemeGrid(props: { kind: "corners" | "edges" }) {
  const names = props.kind === "corners" ? CORNER_ORDER : EDGE_ORDER;
  return (
    <div class="scheme-grid">
      <For each={names}>
        {(name) => (
          <label class="scheme-cell">
            <span class="muted mono">{name}</span>
            <input
              class="mono"
              maxLength={2}
              value={settings.letterScheme[props.kind][name] ?? ""}
              onInput={(e) =>
                setSettings("letterScheme", props.kind, name, e.currentTarget.value.trim())
              }
            />
          </label>
        )}
      </For>
    </div>
  );
}

function BufferList(props: { kind: "corners" | "edges" }) {
  const list = () => settings.buffers[props.kind];
  const validate = (name: string) =>
    props.kind === "corners" ? cornerStickerByName(name) !== null : edgeStickerByName(name) !== null;

  const move = (i: number, dir: -1 | 1) => {
    const xs = [...list()];
    const j = i + dir;
    if (j < 0 || j >= xs.length) return;
    [xs[i], xs[j]] = [xs[j], xs[i]];
    setSettings("buffers", props.kind, xs);
  };

  const remove = (i: number) => {
    setSettings(
      "buffers",
      props.kind,
      list().filter((_, k) => k !== i),
    );
  };

  const add = (e: SubmitEvent) => {
    e.preventDefault();
    const input = (e.currentTarget as HTMLFormElement).elements.namedItem("buf") as HTMLInputElement;
    const name = input.value.trim().toUpperCase();
    if (!name || !validate(name) || list().includes(name)) return;
    setSettings("buffers", props.kind, [...list(), name]);
    input.value = "";
  };

  return (
    <div class="bufferlist">
      <For each={list()}>
        {(b, i) => (
          <span class="buffer-chip mono">
            {b}
            <button onClick={() => move(i(), -1)} title="higher priority">
              ↑
            </button>
            <button onClick={() => move(i(), 1)} title="lower priority">
              ↓
            </button>
            <button onClick={() => remove(i())} title="remove">
              ×
            </button>
          </span>
        )}
      </For>
      <form onSubmit={add} class="buffer-add">
        <input name="buf" class="mono" placeholder={props.kind === "corners" ? "e.g. RDF" : "e.g. LU"} size={6} />
        <button type="submit">Add</button>
      </form>
    </div>
  );
}

export default function SettingsPage() {
  const orientationValid = createMemo(() => {
    const v = settings.orientation.trim();
    return v === "" || /^([xyz][2']?\s*)+$/.test(v);
  });

  return (
    <div class="settings-page">
      <div class="card">
        <h3>Timer</h3>
        <div class="settings-rows">
          <label>
            Space hold time (ms, 0 = instant)
            <input
              type="number"
              min="0"
              step="50"
              value={settings.holdMs}
              onInput={(e) => setSettings("holdMs", Math.max(0, Number(e.currentTarget.value) || 0))}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.showRunningTime}
              onChange={(e) => setSettings("showRunningTime", e.currentTarget.checked)}
            />
            Show running time
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.showTimeDuringMemo}
              onChange={(e) => setSettings("showTimeDuringMemo", e.currentTarget.checked)}
            />
            Show time during memo
          </label>
          <label>
            Theme
            <select value={settings.theme} onChange={(e) => setSettings("theme", e.currentTarget.value as "dark" | "light")}>
              <option value="dark">dark</option>
              <option value="light">light</option>
            </select>
          </label>
        </div>
      </div>

      <div class="card">
        <h3>Cube orientation</h3>
        <p class="muted">
          Rotations applied from white-top / green-front to how you hold the cube, e.g. <code>x y</code>.
          Letters and buffers are interpreted in this frame.
        </p>
        <input
          class="mono"
          style={{ width: "160px" }}
          placeholder="e.g. x y"
          value={settings.orientation}
          onInput={(e) => setSettings("orientation", e.currentTarget.value)}
        />
        <Show when={!orientationValid()}>
          <span class="bad"> only x / y / z rotations are allowed</span>
        </Show>
      </div>

      <div class="card">
        <h3>Letter scheme</h3>
        <p class="muted">Speffz by default. Each sticker can carry your own letter (max 2 chars).</p>
        <h4>Corners</h4>
        <SchemeGrid kind="corners" />
        <h4>Edges</h4>
        <SchemeGrid kind="edges" />
        <button onClick={() => resetLetterScheme()}>Reset to Speffz</button>
      </div>

      <div class="card">
        <h3>Buffer priority</h3>
        <p class="muted">
          Used to label detected cycles: the first buffer in this order whose position is part of a cycle
          names the case. Buffers are stickers (RDF is the R sticker of the DFR corner).
        </p>
        <h4>Edges</h4>
        <BufferList kind="edges" />
        <h4>Corners</h4>
        <BufferList kind="corners" />
      </div>
    </div>
  );
}
