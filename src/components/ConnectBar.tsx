import { For, Show } from "solid-js";
import { settings, setSettings } from "~/state/settings";
import { useApp } from "~/state/app";

function SessionPicker() {
  const app = useApp();
  const add = () => {
    const name = prompt("Session name")?.trim();
    if (name) void app.addSession(name);
  };
  const reset = () => {
    const n = app.sessionSolves().length;
    const name = app.currentSession()?.name ?? "this session";
    if (confirm(`Delete all ${n} attempt${n === 1 ? "" : "s"} in "${name}"? This cannot be undone.`)) {
      void app.clearSession();
    }
  };
  return (
    <div class="session-picker">
      <select
        value={settings.sessionId ?? ""}
        onChange={(e) => setSettings("sessionId", e.currentTarget.value)}
      >
        <For each={app.sessions()}>{(s) => <option value={s.id}>{s.name}</option>}</For>
      </select>
      <button onClick={add} title="New session">
        +
      </button>
      <button onClick={reset} disabled={app.sessionSolves().length === 0} title="Delete all attempts in this session">
        Reset
      </button>
    </div>
  );
}

export function ConnectBar() {
  const app = useApp();
  return (
    <div class="connect-bar">
      <Show
        when={app.cube()}
        fallback={
          <>
            <button class="primary" onClick={() => void app.connectSmart()}>
              Connect cube
            </button>
            <button onClick={() => app.connectVirtual()}>Virtual cube</button>
          </>
        }
      >
        {(io) => (
          <>
            <span class="conn-name">
              <span class="conn-dot" /> {io().name}
              <Show when={app.battery() !== null}>
                <span class="muted">{app.battery()}%</span>
              </Show>
            </span>
            <button
              onClick={() => app.machine.markSolved()}
              title="Fixes desync. Same as turning U or D four times."
            >
              Mark solved
            </button>
            <button onClick={() => app.disconnect()}>Disconnect</button>
          </>
        )}
      </Show>
      <SessionPicker />
      <Show when={app.error()}>
        <span class="bad conn-error" onClick={() => app.setError(null)}>
          {app.error()}
        </span>
      </Show>
    </div>
  );
}
