// Rail motion verification: geometry, ghost diff, console errors.
//
// The rail is notification-driven: calm (zero mail) is the tab pill alone,
// centred; alert (badge > 0) melts the bell out of the pill's left cap.
// Runs the built site in headless Chromium and records, per animation
// frame, what the morph does: the tab pill's left/top (it now travels the
// 33px re-centring ride on purpose), its glass cover's rect (they must
// ride together — a drift means a ghost), the morph host's width (0 in
// calm, 56 in alert), the neck, and the badge. Also pixel-diffs the calm
// state before/after a full alert+calm cycle (a ghost disc would show up
// as differing pixels) and collects console/page errors.
//
// Requirements:
//   npm ci                        # installs playwright-core + @sparticuz/chromium
//   npm run preview               # in another terminal (or set RAIL_URL)
//   npm run verify:rail
//
// The browser is @sparticuz/chromium: its npm tarball carries the Brotli
// binary, so no CDN download is needed; the three NSS libs it misses on
// plain Debian are extracted from the package's own al2023.tar.br into
// /tmp and fed through LD_LIBRARY_PATH. Outputs land in verify-artifacts/
// (gitignored).
import { chromium } from "playwright-core";
import sparticuz from "@sparticuz/chromium";
import { brotliDecompressSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const OUT = "verify-artifacts";
const URL = process.env.RAIL_URL ?? "http://127.0.0.1:4173/";

// --- the NSS/NSPR libs the Lambda build expects, from the package itself --
const LIB = "/tmp/al2023/lib";
if (!fs.existsSync(`${LIB}/libnss3.so`)) {
  const br = "node_modules/@sparticuz/chromium/bin/al2023.tar.br";
  fs.mkdirSync("/tmp/al2023", { recursive: true });
  fs.writeFileSync("/tmp/al2023.tar", brotliDecompressSync(fs.readFileSync(br)));
  execFileSync("tar", ["xf", "/tmp/al2023.tar", "-C", "/tmp/al2023"]);
}
process.env.LD_LIBRARY_PATH = [LIB, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":");

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const shot = (name) => `${OUT}/${name}`;

// ImageMagick 7 ships `magick`, 6 ships `compare`; take whichever exists.
const pixelDiff = (a, b, out) => {
  for (const bin of [["magick", "compare"], ["compare"]]) {
    try {
      execFileSync(bin[0], [...bin.slice(1), "-metric", "AE", a, b, out], { stdio: "pipe" });
      return 0;
    } catch (e) {
      if (e.code === "ENOENT") continue;
      const n = Number((e.stderr || Buffer.from("")).toString().trim());
      if (Number.isFinite(n) && (e.stderr || "").toString().trim() !== "") return n;
    }
  }
  return "unavailable";
};

const exe = await sparticuz.executablePath();
const browser = await chromium.launch({
  executablePath: exe,
  args: [...sparticuz.args, "--no-sandbox"],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
});

const problems = [];
page.on("console", (m) => {
  if (m.type() === "error") problems.push(`console: ${m.text().slice(0, 160)}`);
});
page.on("pageerror", (e) => problems.push(`pageerror: ${String(e.message).slice(0, 160)}`));

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(2500); // let the glass init, video, and fonts settle

const fontProbe = await page.evaluate(() => {
  const c = document.createElement("canvas").getContext("2d");
  c.font = '600 16px "Noto Sans Arabic", serif';
  const noto = c.measureText("\u0645\u06cc\u0632\u06a9\u0627\u0631").width;
  c.font = "600 16px serif";
  const bare = c.measureText("\u0645\u06cc\u0632\u06a9\u0627\u0631").width;
  return { noto, bare, resolved: noto !== bare };
});

const railBox = await page.evaluate(() => {
  const r = document.querySelector(".rail").getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
});
const clip = {
  x: Math.round(railBox.x - 60),
  y: Math.round(railBox.y - 60),
  width: Math.round(railBox.width + 120),
  height: Math.round(railBox.height + 120),
};

const startRecorder = () =>
  page.evaluate(() => {
    const tabs = document.querySelector(".rail-tabs");
    const cover = document.querySelector(".rail-tabs + .lg-cover");
    const morph = document.querySelector(".rail-morph");
    const neck = document.querySelector(".rail-neck");
    window.__rec = { t0: performance.now(), frames: [] };
    const tick = () => {
      const rt = tabs.getBoundingClientRect();
      const rc = cover.getBoundingClientRect();
      const rm = morph.getBoundingClientRect();
      const sp = (neck.dataset.span || "").split(",").map(Number);
      window.__rec.frames.push({
        t: +(performance.now() - window.__rec.t0).toFixed(1),
        tabsLeft: +rt.left.toFixed(1),
        tabsTop: +rt.top.toFixed(1),
        tabsW: +rt.width.toFixed(1),
        coverLeft: +rc.left.toFixed(1),
        coverTop: +rc.top.toFixed(1),
        coverW: +rc.width.toFixed(1),
        tabsVis: getComputedStyle(tabs).visibility,
        morphW: +rm.width.toFixed(1),
        morphR: +rm.right.toFixed(1),
        neckVis: getComputedStyle(neck).visibility,
        neckPhase: neck.dataset.phase || "",
        // as written by the driver: neck caps + the rects that frame used
        neckL: sp.length === 4 ? sp[0] : null,
        neckR: sp.length === 4 ? sp[1] : null,
        neckMorphR: sp.length === 4 ? sp[2] : null,
        neckTabsL: sp.length === 4 ? sp[3] : null,
      });
      if (performance.now() - window.__rec.t0 < 2200) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

const collect = () => page.evaluate(() => window.__rec.frames);

// --- 1. the calm state (zero mail: pill alone, centred, no bell) ----------
const badgeState = () =>
  page.evaluate(() => {
    const b = document.querySelector(".rail-badge");
    const m = document.querySelector(".rail-morph");
    const cs = getComputedStyle(b);
    return {
      text: b.textContent,
      scale: cs.scale,
      morphVis: getComputedStyle(m).visibility,
      morphHref: m.hasAttribute("href"),
      state: document.querySelector(".rail").dataset.state,
    };
  });
const report0 = {};
report0.calmBadge = await badgeState();
if (report0.calmBadge.state !== "calm") problems.push(`initial state ${report0.calmBadge.state}`);
if (report0.calmBadge.morphVis !== "hidden") problems.push("calm: bell still visible");
if (report0.calmBadge.morphHref) problems.push("calm: melted bell still a link");
await page.screenshot({ path: shot("00-full-calm.png") });
await page.screenshot({ path: shot("01-rail-calm.png"), clip });

// --- 2. ALERT: switch on -> mail arrives, bell melts out with the badge ---
await startRecorder();
await page.click(".morph-switch");
await page.waitForTimeout(1400);
const openFrames = await collect();
report0.alertBadge = await badgeState();
if (report0.alertBadge.state !== "alert") problems.push(`alert state ${report0.alertBadge.state}`);
if (report0.alertBadge.text !== "3" || report0.alertBadge.scale !== "1")
  problems.push(`alert badge: ${JSON.stringify(report0.alertBadge)}`);
if (!report0.alertBadge.morphHref) problems.push("alert: bell lost its link");
await page.screenshot({ path: shot("00-full-alert.png") });
await page.screenshot({ path: shot("02-rail-alert.png"), clip });

// --- 3. CALM again: switch off -> mail cleared, bell melts back -----------
await startRecorder();
await page.click(".morph-switch");
await page.waitForTimeout(1400);
const closeFrames = await collect();
report0.calmAgainBadge = await badgeState();
if (report0.calmAgainBadge.morphVis !== "hidden") problems.push("calm again: bell still visible");
await page.screenshot({ path: shot("03-rail-calm-again.png"), clip });

// --- 3b. the liquid neck: present mid-morph, absent at rest, caps tucked ---
// The neck is a sibling of the hosts with its own backdrop-filter, so the
// rail and both hosts must stay filter-free, and every visible neck frame
// must keep its 26px tuck under the cap it bridges from (bridge regime:
// morph.right -> tabs.left; wet-seam regime: straddling morph.right).
const hostFiltersClean = await page.evaluate(() =>
  [".rail", ".rail-morph", ".rail-tabs"].every((s) => {
    const c = getComputedStyle(document.querySelector(s));
    return c.filter === "none" && (c.backdropFilter === "none" || c.backdropFilter === "");
  })
);
if (!hostFiltersClean) problems.push("neck: filter/backdrop-filter on rail or a host");
for (const [dir, fr] of [
  ["open", openFrames],
  ["close", closeFrames],
]) {
  // both resting states stay neckless: the neck lives only in the motion
  if (fr[0]?.neckVis !== "hidden" || fr.at(-1)?.neckVis !== "hidden")
    problems.push(`neck: ${dir} resting state is not neckless`);
  const vis = fr.filter((f) => f.neckVis === "visible");
  if (!vis.length) problems.push(`neck: ${dir} never visible mid-morph`);
  // fade frames hold the last live path on purpose (melt-away), so the
  // tuck/liveness math only applies while the driver writes fresh rects
  const bad = vis.filter((f) => f.neckPhase === "live").filter((f) => {
    const i = fr.indexOf(f);
    // the driver's rects may lag this recorder by one rAF tick (software
    // rasterizers stretch a tick to ~60ms), so accept any morph edge the
    // rail actually had within the last three frames
    const win = fr.slice(Math.max(0, i - 2), i + 1).map((g) => g.morphR);
    const live = f.neckMorphR >= Math.min(...win) - 0.5 && f.neckMorphR <= Math.max(...win) + 0.5;
    // the tab pill now travels (the re-centring ride), so the driver's
    // tabs read can lag this recorder by a tick exactly like morph's
    const winT = fr.slice(Math.max(0, i - 2), i + 1).map((g) => g.tabsLeft);
    const tabsLive = f.neckTabsL >= Math.min(...winT) - 0.5 && f.neckTabsL <= Math.max(...winT) + 0.5;
    return !(
        Math.abs(f.neckL - (f.neckMorphR - 26)) <= 0.2 &&
        (Math.abs(f.neckR - (f.neckTabsL + 26)) <= 0.2 ||
          Math.abs(f.neckR - (f.neckMorphR + 26)) <= 0.2) &&
      live &&
      tabsLive
    );
  });
  if (bad.length)
    problems.push(
      `neck: ${dir} cap tuck off in ${bad.length} frames, e.g. ${JSON.stringify(bad[0])}`
    );
}

// --- 3c. reduced motion: the neck loop must never run ----------------------
await page.emulateMedia({ reducedMotion: "reduce" });
await startRecorder();
await page.click(".morph-switch");
await page.waitForTimeout(700);
const prmFrames = await collect();
await page.emulateMedia({ reducedMotion: null });
await page.waitForTimeout(900);
if (prmFrames.some((f) => f.neckVis === "visible"))
  problems.push("neck: visible under prefers-reduced-motion");

// --- 4. ghost diff: calm again must be pixel-identical to calm ------------
const ghostAE = pixelDiff(shot("01-rail-calm.png"), shot("03-rail-calm-again.png"), shot("ghost-diff.png"));

// --- 5. static assertions from the recorded frames -------------------------
const analyze = (frames) => {
  const lefts = frames.map((f) => f.tabsLeft);
  const drift = frames.map((f) => +(f.coverLeft - f.tabsLeft).toFixed(1));
  const tops = frames.map((f) => +(f.coverTop - f.tabsTop).toFixed(1));
  const widths = frames.map((f) => +(f.coverW - f.tabsW).toFixed(1));
  const morphW = frames.map((f) => f.morphW);
  return {
    n: frames.length,
    tabsLeftMin: Math.min(...lefts),
    tabsLeftMax: Math.max(...lefts),
    coverTabsLeftDriftMax: Math.max(...drift.map(Math.abs)),
    coverTabsTopDriftMax: Math.max(...tops.map(Math.abs)),
    coverTabsWidthDriftMax: Math.max(...widths.map(Math.abs)),
    morphWMin: Math.min(...morphW),
    morphWMax: Math.max(...morphW),
    tabsTopMin: Math.min(...frames.map((f) => f.tabsTop)),
    tabsTopMax: Math.max(...frames.map((f) => f.tabsTop)),
    visStart: frames[0]?.tabsVis,
    visEnd: frames.at(-1)?.tabsVis,
    neckVisibleFrames: frames.filter((f) => f.neckVis === "visible").length,
    neckFadeFrames: frames.filter((f) => f.neckPhase === "fade").length,
    neckAtStart: frames[0]?.neckVis,
    neckAtEnd: frames.at(-1)?.neckVis,
  };
};

const result = {
  url: URL,
  badges: report0,
  browser: browser.version(),
  reducedMotion: await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches),
  railBox,
  fontProbe,
  ghostAbsoluteErrorPixels: ghostAE,
  hostFiltersClean,
  open: analyze(openFrames),
  close: analyze(closeFrames),
  openFrameSample: openFrames.filter((_, i) => i % 6 === 0),
  closeFrameSample: closeFrames.filter((_, i) => i % 6 === 0),
  problems,
};
fs.writeFileSync(shot("report.json"), JSON.stringify(result, null, 1));
console.log(
  JSON.stringify(
    {
      browser: browser.version(),
      reducedMotion: result.reducedMotion,
      fontProbe,
      ghostAE,
      badges: result.badges,
      open: result.open,
      close: result.close,
      problems: problems.slice(0, 6),
    },
    null,
    1
  )
);

await browser.close();
