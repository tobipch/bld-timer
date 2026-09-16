import { createEffect, createRoot } from "solid-js";
import { createStore } from "solid-js/store";
import { DEFAULT_FLOW_OPTIONS, type FlowOptions } from "~/lib/flow";

export interface Settings {
  /** what counts as a pause; see lib/flow */
  flow: FlowOptions;
  theme: "dark" | "light";
  sessionId: string | null;
}

const KEY = "bld-timer.settings";

function defaults(): Settings {
  return {
    flow: { ...DEFAULT_FLOW_OPTIONS },
    theme: "dark",
    sessionId: null,
  };
}

function load(): Settings {
  if (typeof localStorage === "undefined") return defaults();
  const d = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      flow: { ...d.flow, ...(parsed.flow ?? {}) },
      theme: parsed.theme === "light" ? "light" : "dark",
      sessionId: parsed.sessionId ?? null,
    };
  } catch {
    return d;
  }
}

export const { settings, setSettings } = createRoot(() => {
  const [settings, setSettings] = createStore<Settings>(load());

  createEffect(() => {
    // touch everything for the deep persist
    const snapshot = JSON.stringify(settings);
    if (typeof localStorage !== "undefined") localStorage.setItem(KEY, snapshot);
    if (typeof document !== "undefined") {
      document.documentElement.dataset.theme = settings.theme;
    }
  });

  return { settings, setSettings };
});
