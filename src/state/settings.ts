import { createEffect, createRoot } from "solid-js";
import { createStore } from "solid-js/store";
import { DEFAULT_FLOW_OPTIONS, type FlowOptions } from "~/lib/flow";
import { holdFaceMap } from "~/lib/cube/orientation";

export interface Settings {
  /** what counts as a pause; see lib/flow */
  flow: FlowOptions;
  /** the colours up and front when you solve; the scramble is shown that way */
  topColor: string;
  frontColor: string;
  theme: "dark" | "light";
  sessionId: string | null;
}

const KEY = "bld-timer.settings";

function defaults(): Settings {
  return {
    flow: { ...DEFAULT_FLOW_OPTIONS },
    topColor: "white",
    frontColor: "green",
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
    // an impossible colour pair (or one from an older build) falls back to
    // the WCA orientation rather than leaving the scramble untranslatable
    const colors =
      parsed.topColor && parsed.frontColor && holdFaceMap(parsed.topColor, parsed.frontColor)
        ? { topColor: parsed.topColor, frontColor: parsed.frontColor }
        : { topColor: d.topColor, frontColor: d.frontColor };
    return {
      flow: { ...d.flow, ...(parsed.flow ?? {}) },
      ...colors,
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
