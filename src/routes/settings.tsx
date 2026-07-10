import { Show } from "solid-js";
import { LetterSchemeCube } from "~/components/LetterSchemeCube";
import { ProfileEditor } from "~/components/ProfileEditor";
import { resetLetterScheme, settings, setSettings } from "~/state/settings";

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

      <div class="card">
        <h3>Letter scheme</h3>
        <p class="muted">
          Speffz by default — edit any sticker directly on the cube (corners in the corners, edges on
          the edges). Colors follow your color scheme.
        </p>
        <LetterSchemeCube />
        <button onClick={() => resetLetterScheme()}>Reset to Speffz</button>
        <p class="muted small-note">
          Derived orientation (from your color scheme):{" "}
          <span class="mono">{settings.orientation || "(none — white top, green front)"}</span>
        </p>
      </div>
    </div>
  );
}
