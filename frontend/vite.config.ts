import { svelte } from "@sveltejs/vite-plugin-svelte";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      // `$lib/core/types` instead of `../../core/types`. Imports stay the same
      // however deep a file sits, so moving a component never breaks them.
      // TypeScript needs the matching "paths" entry in tsconfig.app.json.
      $lib: fileURLToPath(new URL("./src/lib", import.meta.url)),
    },
  },
  server: {
    proxy: {
      // The frontend runs on :5173 and the backend on :8000, which are different
      // origins, so the browser would block the search request. Proxying /api
      // through the dev server makes it same-origin and sidesteps CORS entirely.
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
