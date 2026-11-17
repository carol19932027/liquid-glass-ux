import { defineConfig } from "vite";

// Vite is the build tool for this project: `vite build` produces `dist/`, which the
// Cloudflare Worker serves through its `assets` binding (see wrangler.jsonc).
//
// `vite dev` is kept only as a local convenience for tuning CSS/SVG with HMR.
// It is never used in CI and never exposed publicly — the local server that mirrors
// production is `wrangler dev` (npm run worker:dev).
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    allowedHosts: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
    strictPort: true,
    allowedHosts: true,
  },
});
