import { Hono } from "hono";

/**
 * Cloudflare Worker entry point.
 *
 * Static files come from the assets binding (`dist/`, produced by `vite build`);
 * this Worker only adds a few server-side routes. Paths listed in
 * `assets.run_worker_first` (wrangler.jsonc) reach this file — everything else is
 * served directly by the asset server, with `index.html` as the SPA fallback.
 *
 * The ASSETS binding is typed structurally on purpose: it keeps `tsc` working with
 * the project's DOM lib without pulling in the full Workers type globals.
 */
type AssetFetcher = {
  fetch(request: Request | string, init?: RequestInit): Promise<Response>;
};

type Env = {
  ASSETS: AssetFetcher;
};

const app = new Hono<{ Bindings: Env }>();

/** Liveness probe used by CI and by the deploy workflow after each publish. */
app.get("/healthz", (c) =>
  c.json({
    ok: true,
    worker: "liquid-glass-ux",
    ts: new Date().toISOString(),
  }),
);

/** Anything else that reaches the Worker is handed to the static assets. */
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
