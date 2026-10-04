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
        <h3>Orientation</h3>
        <div class="settings-rows">
          <ColorRow which="topColor" />
          <ColorRow which="frontColor" />
        </div>
      </div>

      <div class="card">
        <h3>Pauses</h3>
        <div class="settings-rows">
          <label>
            Minimum (ms)
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
            Multiple of median gap
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
              Reset
            </button>
          </div>
        </div>
      </div>

      <div class="card">
        <h3>Theme</h3>
        <div class="settings-rows">
          <label>
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
