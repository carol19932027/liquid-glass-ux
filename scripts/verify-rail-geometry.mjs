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
    const morph = document.querySelector(".rail-morph");
    window.__rec = { t0: performance.now(), frames: [] };
    const tick = () => {
      const rt = tabs.getBoundingClientRect();
      const rm = morph.getBoundingClientRect();
      window.__rec.frames.push({
        t: +(performance.now() - window.__rec.t0).toFixed(1),
        tabsLeft: +rt.left.toFixed(1),
        tabsTop: +rt.top.toFixed(1),
        tabsW: +rt.width.toFixed(1),
        tabsVis: getComputedStyle(tabs).visibility,
        morphW: +rm.width.toFixed(1),
        morphL: +rm.left.toFixed(1),
        morphR: +rm.right.toFixed(1),
        morphVis: getComputedStyle(morph).visibility,
        // cap gap: negative while the bell's cap is INSIDE the pill's
        gap: +(rt.left - rm.right).toFixed(1),
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
if (report0.calmBadge.morphVis !== "visible") problems.push("calm: bell item not visible");
if (!report0.calmBadge.morphHref) problems.push("calm: bell item lost its link");
report0.calmLens = await page.evaluate(() => {
  const pill = document.querySelector(".rail-tabs").getBoundingClientRect();
  const m = document.querySelector(".rail-morph").getBoundingClientRect();
  const tabLefts = [...document.querySelectorAll(".rail-tab")].map((t) => t.getBoundingClientRect().left);
  return {
    inset: +(m.left - pill.left).toFixed(1),
    reach: +(m.right - pill.left).toFixed(1),
    tabClear: +(Math.min(...tabLefts) - m.right).toFixed(1),
  };
});
if (!(report0.calmLens.inset >= 2 && report0.calmLens.inset <= 10))
  problems.push(`calm: lens inset ${report0.calmLens.inset} not inside the pill cap`);
if (!(report0.calmLens.reach >= 40 && report0.calmLens.reach <= 60))
  problems.push(`calm: lens reach ${report0.calmLens.reach} off`);
if (report0.calmLens.tabClear < 2)
  problems.push(`calm: lens overlaps the first tab (${report0.calmLens.tabClear})`);
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
if (report0.calmAgainBadge.morphVis !== "visible") problems.push("calm again: bell item not visible");
await page.screenshot({ path: shot("03-rail-calm-again.png"), clip });

// --- 3b. the fusion is optical: no third paint, hosts filter-free, and
// the two glasses actually inter-penetrate mid-flight (stacked backdrop
// filters = denser liquid at the junction), parting to the resting gap.
const noNeck = await page.evaluate(() => !document.querySelector(".rail-neck"));
if (!noNeck) problems.push("neck: a neck element still exists");
// exactly one backdrop root in the rail: the metaball lens layer; the
// content spans and the shell itself must stay filter-free, and the
// lens must wear its silhouette mask at rest
const railGlass = await page.evaluate(() => {
  const bd = (s) => {
    const c = getComputedStyle(document.querySelector(s));
    return c.backdropFilter !== "none" && c.backdropFilter !== "";
  };
  return {
    lens: bd(".rail-glass"),
    masked: getComputedStyle(document.querySelector(".rail-glass")).maskImage !== "none",
    rimMasked: getComputedStyle(document.querySelector(".rail-rim")).maskImage !== "none",
    clean: [".rail", ".rail-morph", ".rail-tabs", ".rail-tab"].every((s) => !bd(s)),
  };
});
if (!railGlass.lens || !railGlass.masked || !railGlass.rimMasked)
  problems.push(`glass: lens layer incomplete ${JSON.stringify(railGlass)}`);
if (!railGlass.clean) problems.push("glass: stray backdrop root inside the rail");
for (const [dir, fr] of [
  ["open", openFrames],
  ["close", closeFrames],
]) {
  const gaps = fr.map((f) => f.gap);
  const end = gaps.at(-1);
  // one body dividing: the cap gap must travel monotonically between
  // the lens-inside rest and the two-piece rest; a reversal mid-flight
  // (ignoring the spring's settle wiggle near the end) means the piece
  // bounced instead of flowing
  for (let i2 = 1; i2 < gaps.length; i2++) {
    if (Math.abs(gaps[i2] - end) < 6) continue;
    const d = gaps[i2] - gaps[i2 - 1];
    if ((dir === "open" && d < -2.5) || (dir === "close" && d > 2.5)) {
      problems.push(`fusion: ${dir} gap reverses at t=${fr[i2].t} (${gaps[i2 - 1]} -> ${gaps[i2]})`);
      break;
    }
  }
  const last = fr.at(-1);
  if (dir === "open") {
    if (Math.abs(last.gap - 10) > 0.6) problems.push(`fusion: open rest gap ${last.gap}`);
  } else if (last.gap > -40 || last.gap < -60) {
    problems.push(`fusion: close rest lens not inside the pill (gap ${last.gap})`);
  }
}

// --- 3c. reduced motion: the flip is instant, nothing travels -----------
await page.emulateMedia({ reducedMotion: "reduce" });
await startRecorder();
await page.click(".morph-switch");
await page.waitForTimeout(700);
const prmFrames = await collect();
await page.emulateMedia({ reducedMotion: null });
await page.waitForTimeout(900);
// the flip itself still happens under PRM (0 -> 56 in 1ms); what must
// not exist is any INTERMEDIATE width, i.e. visible travel
if (prmFrames.some((f) => f.morphW > 44.5 && f.morphW < 55.5))
  problems.push("prm: morph still travels under prefers-reduced-motion");

// --- 4. ghost diff: calm again must be pixel-identical to calm ------------
const ghostAE = pixelDiff(shot("01-rail-calm.png"), shot("03-rail-calm-again.png"), shot("ghost-diff.png"));

// --- 5. static assertions from the recorded frames -------------------------
const analyze = (frames) => {
  const lefts = frames.map((f) => f.tabsLeft);
  const morphW = frames.map((f) => f.morphW);
  return {
    n: frames.length,
    tabsLeftMin: Math.min(...lefts),
    tabsLeftMax: Math.max(...lefts),
    morphWMin: Math.min(...morphW),
    morphWMax: Math.max(...morphW),
    tabsTopMin: Math.min(...frames.map((f) => f.tabsTop)),
    tabsTopMax: Math.max(...frames.map((f) => f.tabsTop)),
    visStart: frames[0]?.tabsVis,
    visEnd: frames.at(-1)?.tabsVis,
    gapMin: Math.min(...frames.map((f) => f.gap)),
    gapEnd: frames.at(-1)?.gap,
    morphVisEnd: frames.at(-1)?.morphVis,
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
  railGlass,
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
