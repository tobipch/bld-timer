import { createMemo, createSignal, For, Show } from "solid-js";
import { MODE_HINT, MODE_LABEL, SCRAMBLE_MODES, type ScrambleMode } from "~/lib/scramble";
import { settings, setSettings } from "~/state/settings";
import { useApp } from "~/state/app";

/**
 * Which exercise, and which session of it. The three scramble kinds are
 * separate sessions because their numbers are not comparable: an edge-only
 * execution is a different thing from a full solve.
 */
export function SessionBar() {
  const app = useApp();
  const [adding, setAdding] = createSignal(false);
  const [name, setName] = createSignal("");

  const ofMode = createMemo(() => app.sessions().filter((s) => s.mode === app.mode()));

  const add = (mode: ScrambleMode) => {
    const n = name().trim();
    if (!n) return;
    void app.addSession(n, mode);
    setName("");
    setAdding(false);
  };

  return (
    <div class="session-bar card">
      <div class="scope-toggle">
        <For each={SCRAMBLE_MODES}>
          {(m) => (
            <button
              classList={{ active: app.mode() === m }}
              title={MODE_HINT[m]}
              onClick={() => app.selectMode(m)}
            >
              {MODE_LABEL[m]}
            </button>
          )}
        </For>
      </div>
      <span class="muted mode-hint">{MODE_HINT[app.mode()]}</span>

      {/* always shown, even with a single session: which one you are recording
          into is not something to leave implicit */}
      <Show when={ofMode().length > 0}>
        <select
          value={settings.sessionId ?? ""}
          onChange={(e) => setSettings("sessionId", e.currentTarget.value)}
        >
          <For each={ofMode()}>{(s) => <option value={s.id}>{s.name}</option>}</For>
        </select>
      </Show>

      <Show
        when={adding()}
        fallback={
          <button class="link-btn" onClick={() => setAdding(true)}>
            new session
          </button>
        }
      >
        <form
          class="session-add"
          onSubmit={(e) => {
            e.preventDefault();
            add(app.mode());
          }}
        >
          <input
            autofocus
            placeholder={`new ${MODE_LABEL[app.mode()].toLowerCase()} session`}
            value={name()}
            onInput={(e) => setName(e.currentTarget.value)}
          />
          <button type="submit">Add</button>
          <button type="button" onClick={() => setAdding(false)}>
            Cancel
          </button>
        </form>
      </Show>
    </div>
  );
}
