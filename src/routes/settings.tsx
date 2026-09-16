import { DEFAULT_FLOW_OPTIONS } from "~/lib/flow";
import { settings, setSettings } from "~/state/settings";

export default function SettingsPage() {
  const flow = () => settings.flow;

  return (
    <div class="settings-page">
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
