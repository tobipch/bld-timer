import { createSignal, For, Show } from "solid-js";
import { ALL_COLORS, COLOR_HEX, orientationFromColors, validFrontColors } from "~/lib/engine/colors";
import { defaultBufferFor, type CornerMethod, type EdgeMethod } from "~/lib/engine/profile";
import { settings, setSettings } from "~/state/settings";

/**
 * The technique profile: method, execution order, colors, buffers, parity
 * style. Used by onboarding and settings; the judge reads this to know
 * which actions are valid in a solve.
 */

const CORNER_METHODS: { id: CornerMethod; name: string; desc: string }[] = [
  { id: "op", name: "Old Pochmann", desc: "one target at a time with swap algs (Y-perm)" },
  { id: "orozco", name: "Orozco", desc: "comms through a fixed helper piece" },
  { id: "3style", name: "3-Style", desc: "a commutator per letter pair" },
];

const EDGE_METHODS: { id: EdgeMethod; name: string; desc: string }[] = [
  { id: "op", name: "Old Pochmann", desc: "one target at a time with swap algs (T/J-perm)" },
  { id: "m2", name: "M2", desc: "one target at a time around M2" },
  { id: "orozco", name: "Orozco", desc: "comms through a fixed helper piece" },
  { id: "3style", name: "3-Style", desc: "a commutator per letter pair" },
];

function MethodPicker(props: { kind: "corner" | "edge" }) {
  const methods = props.kind === "corner" ? CORNER_METHODS : EDGE_METHODS;
  const value = () => (props.kind === "corner" ? settings.profile.cornerMethod : settings.profile.edgeMethod);
  const pick = (id: CornerMethod | EdgeMethod) => {
    if (props.kind === "corner") setSettings("profile", "cornerMethod", id as CornerMethod);
    else setSettings("profile", "edgeMethod", id as EdgeMethod);
    // methods come with their conventional standard buffer
    const buf = defaultBufferFor(props.kind, id);
    const key = props.kind === "corner" ? "corners" : "edges";
    const rest = settings.buffers[key].filter((b) => b !== buf);
    setSettings("buffers", key, [buf, ...rest]);
  };
  return (
    <div class="method-picker">
      <For each={methods}>
        {(m) => (
          <button
            classList={{ "tab-active": value() === m.id }}
            title={m.desc}
            onClick={() => pick(m.id)}
          >
            {m.name}
          </button>
        )}
      </For>
      <div class="muted method-desc">{methods.find((m) => m.id === value())?.desc}</div>
    </div>
  );
}

function ColorPicker(props: { which: "topColor" | "frontColor" }) {
  const valid = () => (props.which === "topColor" ? ALL_COLORS : validFrontColors(settings.topColor));
  const value = () => settings[props.which];
  const pick = (c: string) => {
    setSettings(props.which, c);
    let top = settings.topColor;
    let front = settings.frontColor;
    // keep the pair valid
    if (orientationFromColors(top, front) === null) {
      front = validFrontColors(top)[0];
      setSettings("frontColor", front);
    }
    setSettings("orientation", orientationFromColors(settings.topColor, settings.frontColor) ?? "");
  };
  return (
    <div class="color-picker">
      <For each={valid()}>
        {(c) => (
          <button
            class="color-swatch"
            classList={{ selected: value() === c }}
            style={{ background: COLOR_HEX[c] }}
            title={c}
            onClick={() => pick(c)}
          />
        )}
      </For>
    </div>
  );
}

/** Algfolded-style buffer order editor: drag to reorder, arrows as fallback. */
function BufferOrderEditor(props: { kind: "corners" | "edges" }) {
  const order = () => settings.buffers[props.kind];
  const [dragIdx, setDragIdx] = createSignal(-1);
  const [overIdx, setOverIdx] = createSignal(-1);

  const move = (i: number, dir: -1 | 1) => {
    const arr = [...order()];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setSettings("buffers", props.kind, arr);
  };
  const drop = (i: number) => {
    const from = dragIdx();
    if (from >= 0 && from !== i) {
      const arr = [...order()];
      const [moved] = arr.splice(from, 1);
      arr.splice(i, 0, moved);
      setSettings("buffers", props.kind, arr);
    }
    setDragIdx(-1);
    setOverIdx(-1);
  };

  return (
    <ol class="buffer-order">
      <For each={order()}>
        {(buf, i) => (
          <li
            classList={{ dragging: dragIdx() === i(), "drop-target": overIdx() === i() && dragIdx() !== i() }}
            draggable={true}
            onDragStart={(e) => {
              setDragIdx(i());
              e.dataTransfer!.effectAllowed = "move";
              e.dataTransfer!.setData("text/plain", String(i()));
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setOverIdx(i());
            }}
            onDrop={(e) => {
              e.preventDefault();
              drop(i());
            }}
            onDragEnd={() => {
              setDragIdx(-1);
              setOverIdx(-1);
            }}
          >
            <span class="drag-handle muted">⠿</span>
            <span class="muted">{i() + 1}.</span>
            <span class="mono buffer-name">{buf}</span>
            <Show when={i() === 0}>
              <span class="muted buffer-std">standard</span>
            </Show>
            <span class="buffer-arrows">
              <button disabled={i() === 0} onClick={() => move(i(), -1)}>
                ↑
              </button>
              <button disabled={i() === order().length - 1} onClick={() => move(i(), 1)}>
                ↓
              </button>
            </span>
          </li>
        )}
      </For>
    </ol>
  );
}

export function ProfileEditor() {
  const is3StyleCorners = () => settings.profile.cornerMethod === "3style";
  const commBased = (m: string) => m === "3style" || m === "orozco";
  const anyCommMethod = () =>
    commBased(settings.profile.cornerMethod) || commBased(settings.profile.edgeMethod);

  return (
    <div class="profile-editor">
      <section>
        <h4>Corner method</h4>
        <MethodPicker kind="corner" />
        <h4>Edge method</h4>
        <MethodPicker kind="edge" />
        <Show when={settings.profile.edgeMethod === "m2"}>
          <p class="muted small-note">
            M2 works for timing and stats; detailed solve checking for M2 is still in progress.
          </p>
        </Show>
      </section>

      <section>
        <h4>Order</h4>
        <div class="method-picker">
          <button
            classList={{ "tab-active": settings.profile.execOrder === "corners-first" }}
            onClick={() => setSettings("profile", "execOrder", "corners-first")}
          >
            ECCE
          </button>
          <button
            classList={{ "tab-active": settings.profile.execOrder === "edges-first" }}
            onClick={() => setSettings("profile", "execOrder", "edges-first")}
          >
            CEEC
          </button>
          <div class="muted method-desc">
            {settings.profile.execOrder === "corners-first"
              ? "ECCE: memorize edges then corners — execute corners then edges"
              : "CEEC: memorize corners then edges — execute edges then corners"}
          </div>
        </div>
      </section>

      <section>
        <h4>Color scheme</h4>
        <div class="color-row">
          <span class="muted">Top:</span> <ColorPicker which="topColor" />
        </div>
        <div class="color-row">
          <span class="muted">Front:</span> <ColorPicker which="frontColor" />
        </div>
        <p class="muted small-note">How you hold the cube while solving. Letters follow this orientation.</p>
      </section>

      <Show when={anyCommMethod()}>
        <section>
          <h4>Floating buffers</h4>
          <label class="toggle-row">
            <input
              type="checkbox"
              checked={settings.profile.floating}
              onChange={(e) => setSettings("profile", "floating", e.currentTarget.checked)}
            />
            I use floating buffers (open new cycles from other buffers)
          </label>
          <Show when={settings.profile.floating}>
            <div class="buffer-cols">
              <div>
                <h4>Edge buffer order</h4>
                <BufferOrderEditor kind="edges" />
              </div>
              <div>
                <h4>Corner buffer order</h4>
                <BufferOrderEditor kind="corners" />
              </div>
            </div>
          </Show>
          <Show when={!settings.profile.floating}>
            <p class="muted small-note">
              Standard buffers: <span class="mono">{settings.buffers.edges[0]}</span> (edges),{" "}
              <span class="mono">{settings.buffers.corners[0]}</span> (corners) — set by your method
              choice, reorder by enabling floating.
            </p>
          </Show>
        </section>
      </Show>

      <section>
        <h4>Parity</h4>
        <label class="toggle-row">
          <input
            type="checkbox"
            checked={settings.profile.pseudoSwap}
            onChange={(e) => setSettings("profile", "pseudoSwap", e.currentTarget.checked)}
          />
          I pseudo-swap
        </label>
        <p class="muted small-note">
          Pseudo-swap: with parity (an odd number of corner targets), the last edge target is solved while
          deliberately leaving two edges swapped; the parity alg then fixes both swaps at once. If you
          instead solve all edges normally and fix parity separately, leave this off.
        </p>
      </section>

      <Show when={is3StyleCorners()}>
        <section>
          <h4>LTCT</h4>
          <label class="toggle-row">
            <input
              type="checkbox"
              checked={settings.profile.ltct}
              onChange={(e) => setSettings("profile", "ltct", e.currentTarget.checked)}
            />
            I use LTCT algs (last target + corner twist in one alg)
          </label>
        </section>
      </Show>
    </div>
  );
}
