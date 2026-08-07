import { Show } from "solid-js";
import { useApp } from "~/state/app";

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
            <button onClick={() => app.connectVirtual()} title="Keyboard-driven cube for testing">
              Virtual cube
            </button>
          </>
        }
      >
        {(io) => (
          <>
            <span class="conn-name">
              <span class="conn-dot" /> {io().name}
            </span>
            <Show when={app.battery() !== null}>
              <span class="muted">{app.battery()}%</span>
            </Show>
            <button
              onClick={() => app.machine.markSolved()}
              title="Declare the cube's current state solved (fixes desync) — or spin U or D four times on the cube"
            >
              Mark solved
            </button>
            <span class="muted conn-hint">or spin U/D 4× on the cube</span>
            <button onClick={() => app.disconnect()}>Disconnect</button>
          </>
        )}
      </Show>
      <Show when={app.error()}>
        <span class="bad conn-error" onClick={() => app.setError(null)}>
          {app.error()}
        </span>
      </Show>
    </div>
  );
}
