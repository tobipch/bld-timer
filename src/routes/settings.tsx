import { For } from "solid-js";
import { DEFAULT_FLOW_OPTIONS } from "~/lib/flow";
import { ALL_COLORS, COLOR_HEX, holdFaceMap, validFrontColors } from "~/lib/cube/orientation";
import { settings, setSettings } from "~/state/settings";

/**
 * The colours up and front when you solve. Scrambles are shown in that frame,
 * so the cube never has to be turned into the WCA orientation and back.
 */
function ColorRow(props: { which: "topColor" | "frontColor" }) {
  const choices = () => (props.which === "topColor" ? ALL_COLORS : validFrontColors(settings.topColor));

  const pick = (color: string) => {
    setSettings(props.which, color);
    // a new top colour can leave the front one on the opposite face
    if (!holdFaceMap(settings.topColor, settings.frontColor)) {
      setSettings("frontColor", validFrontColors(settings.topColor)[0]);
    }
  };

  return (
    <div class="color-row">
      <span class="muted color-label">{props.which === "topColor" ? "up" : "front"}</span>
      <For each={choices()}>
        {(c) => (
          <button
            class="color-swatch"
            classList={{ selected: settings[props.which] === c }}
            style={{ background: COLOR_HEX[c] }}
            title={c}
            aria-label={c}
            onClick={() => pick(c)}
          />
        )}
      </For>
      <span class="muted">{settings[props.which]}</span>
    </div>
  );
}

export default function SettingsPage() {
  const flow = () => settings.flow;

  return (
    <div class="settings-page">
      <div class="card">
        <h3>How you hold the cube</h3>
        <p class="muted">
          Scrambles are written for the WCA orientation, white up and green front, and a smart cube
          reports its turns in that same frame. Tell it which colours you solve with and the
          scramble is shown in <i>your</i> frame instead — the letters change, the cube ends up in
          exactly the same state, and you never have to turn it into the WCA orientation to
          scramble and back again to solve.
        </p>
        <div class="settings-rows">
          <ColorRow which="topColor" />
          <ColorRow which="frontColor" />
        </div>
        <p class="muted small-note">
          Assumes the standard colour scheme (white opposite yellow, green opposite blue, red
          opposite orange).
        </p>
      </div>

      <div class="card">
        <h3>What counts as a pause</h3>
        <p class="muted">
          A gap between two turns counts as standing still once it is longer than{" "}
          <b>{flow().factor}×</b> your own median gap in that attempt, but never below{" "}
          <b>{flow().floorMs} ms</b>. Only the part above that line is counted, so a gap just over
          it costs just over nothing. Changing this re-scores the whole history — nothing is stored
          with an old setting baked in.
        </p>
        <div class="settings-rows">
          <label>
            Never call a gap shorter than this a pause (ms)
            <input
              type="number"
              min="0"
              step="25"
              value={flow().floorMs}
              onInput={(e) =>
                setSettings("flow", "floorMs", Math.max(0, Number(e.currentTarget.value) || 0))
              }
            />
          </label>
          <label>
            Multiple of your own median gap
            <input
              type="number"
              min="1"
              step="0.25"
              value={flow().factor}
              onInput={(e) =>
                setSettings("flow", "factor", Math.max(1, Number(e.currentTarget.value) || 1))
              }
            />
          </label>
          <div>
            <button onClick={() => setSettings("flow", { ...DEFAULT_FLOW_OPTIONS })}>
              Back to {DEFAULT_FLOW_OPTIONS.factor}× / {DEFAULT_FLOW_OPTIONS.floorMs} ms
            </button>
          </div>
        </div>
      </div>

      <div class="card">
        <h3>Display</h3>
        <div class="settings-rows">
          <label>
            Theme
            <select
              value={settings.theme}
              onChange={(e) => setSettings("theme", e.currentTarget.value === "light" ? "light" : "dark")}
            >
              <option value="dark">dark</option>
              <option value="light">light</option>
            </select>
          </label>
        </div>
      </div>
    </div>
  );
}
