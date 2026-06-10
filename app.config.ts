import { defineConfig } from "@solidjs/start/config";

export default defineConfig({
  // The timer is a client-heavy app (Bluetooth, workers, ms-precision timer);
  // SPA mode avoids hydration on the hot path. Server routes still work for auth/API.
  ssr: false,
  server: {
    preset: "vercel",
  },
});
