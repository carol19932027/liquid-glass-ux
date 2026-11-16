import { defineConfig } from "vite";

const isTunnel = process.env.VITE_TUNNEL === "1";

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    hmr: isTunnel
      ? {
          clientPort: 443,
        }
      : undefined,
    watch: process.env.CI
      ? {
          usePolling: true,
          interval: 500,
        }
      : undefined,
  },
  preview: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    allowedHosts: true,
  },
});
