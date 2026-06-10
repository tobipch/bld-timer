import { defineConfig } from "@solidjs/start/config";

export default defineConfig({
  // The timer is a client-heavy app (Bluetooth, workers, ms-precision timer);
  // SPA mode avoids hydration on the hot path. Server routes still work for auth/API.
  ssr: false,
  server: {
    preset: "vercel",
  },
  vite: {
    // cubing.js spawns its scramble worker from a bundled chunk; Vite's
    // module-preload helper uses `document`, which crashes inside workers —
    // plain dynamic imports keep the worker entry worker-safe.
    build: { modulePreload: false },
    optimizeDeps: { exclude: ["cubing"] },
  },
});
