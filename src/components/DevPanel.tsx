import { createSignal, Show } from "solid-js";
import { VirtualCube } from "~/lib/cube-io/virtual";
import { useApp } from "~/state/app";

/**
 * Controls for the virtual cube: move buttons, an alg input, and a shortcut
 * that applies the current scramble — everything needed to exercise the full
 * solve flow without Bluetooth hardware.
 */
export function DevPanel() {
  const app = useApp();
  const [alg, setAlg] = createSignal("");
  const [err, setErr] = createSignal<string | null>(null);

  const vc = () => {
    const c = app.cube();
    return c && c.kind === "virtual" ? (c as VirtualCube) : null;
  };

  const apply = (s: string) => {
    setErr(null);
    try {
      vc()?.emitAlg(s);
    } catch (e) {
      setErr(`${e}`);
    }
  };

  return (
    <Show when={vc()}>
      <div class="devpanel card">
        <h3>Virtual cube</h3>
        <div class="dev-buttons">
          {["U", "U'", "D", "D'", "L", "L'", "R", "R'", "F", "F'", "B", "B'"].map((m) => (
            <button class="mono" onClick={() => apply(m)}>
              {m}
            </button>
          ))}
        </div>
        <form
          class="dev-alg"
          onSubmit={(e) => {
            e.preventDefault();
            if (alg().trim()) apply(alg());
          }}
        >
          <input
            placeholder="alg, e.g. [R U R', D'] or M2"
            value={alg()}
            onInput={(e) => setAlg(e.currentTarget.value)}
          />
          <button type="submit">Apply</button>
          <button
            type="button"
            disabled={!app.snapshot().scramble}
            onClick={() => {
              const s = app.snapshot().scramble;
              if (s) apply(s);
            }}
            title="Apply the displayed scramble instantly"
          >
            Auto-scramble
          </button>
        </form>
        <Show when={err()}>
          <div class="bad">{err()}</div>
        </Show>
      </div>
    </Show>
  );
}
