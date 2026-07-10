import { For, Show } from "solid-js";
import { ProfileEditor } from "~/components/ProfileEditor";
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

export default function SettingsPage() {
  return (
    <div class="settings-page">
      <div class="card">
        <h3>Your method</h3>
        <p class="muted">
          The solve analysis judges every alg against this profile — keep it accurate.
        </p>
        <ProfileEditor />
        <Show when={settings.profile.onboarded}>
          <button onClick={() => setSettings("profile", "onboarded", false)}>
            Re-run onboarding
          </button>
        </Show>
      </div>

      <div class="card">
        <h3>Timer</h3>
        <div class="settings-rows">
          <label>
            Space hold time before release starts the timer (ms, 0 = instant)
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
            <select
              value={settings.theme}
              onChange={(e) => setSettings("theme", e.currentTarget.value as "dark" | "light")}
            >
              <option value="dark">dark</option>
              <option value="light">light</option>
            </select>
          </label>
        </div>
      </div>

      <details class="card">
        <summary>
          <h3 style={{ display: "inline" }}>Advanced — letter scheme</h3>
        </summary>
        <p class="muted">Speffz by default. Each sticker can carry your own letter (max 2 chars).</p>
        <h4>Corners</h4>
        <SchemeGrid kind="corners" />
        <h4>Edges</h4>
        <SchemeGrid kind="edges" />
        <button onClick={() => resetLetterScheme()}>Reset to Speffz</button>
        <p class="muted small-note">
          Derived orientation (from your color scheme):{" "}
          <span class="mono">{settings.orientation || "(none — white top, green front)"}</span>
        </p>
      </details>
    </div>
  );
}
