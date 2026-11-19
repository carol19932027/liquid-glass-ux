// Rail verification for the iOS 27 metaball lens rail: geometry, tokens,
// targets, ghost diff, console errors.
//
// The rail is notification-driven: calm (zero mail) is the capsule alone,
// centred, the bell melted to radius 0 inside its left cap; alert grows the
// bell droplet out of that cap on the reference spring (k=140, c=16) and
// parks it 10px from the capsule. The lens (src/rail-glass.ts) rasterises
// silhouette + displacement + specular maps per spring frame; this rig
// records the spring's geometry per rAF, checks the resting poses, the
// token wiring, the 44pt targets, and pixel-diffs calm before/after a full
// alert+calm cycle (a ghost disc would show as differing pixels).
//
// Requirements:
//   npm ci                        # installs playwright-core + @sparticuz/chromium
//   npm run build && npm run preview   # :4173 serves dist
//   npm run verify:rail
//
// Outputs land in verify-artifacts/ (gitignored).
import { chromium } from "playwright-core";
import sparticuz from "@sparticuz/chromium";
import { brotliDecompressSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const OUT = "verify-artifacts";
const URL = process.env.RAIL_URL ?? "http://127.0.0.1:4173/";

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
const browser = await chromium.launch({ executablePath: exe, args: [...sparticuz.args, "--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

const problems = [];
page.on("console", (m) => {
  if (m.type() === "error") problems.push(`console: ${m.text().slice(0, 160)}`);
});
page.on("pageerror", (e) => problems.push(`pageerror: ${String(e.message).slice(0, 160)}`));

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);

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

// per-frame spring geometry: bell proxy circle vs capsule proxy
const startRecorder = () =>
  page.evaluate(() => {
    const rail = document.querySelector(".rail");
    const bell = rail.querySelector(".rail-lift-bell");
    const pill = rail.querySelector(".rail-lift-pill");
    window.__rec = { t0: performance.now(), frames: [] };
    const tick = () => {
      const rb = bell.getBoundingClientRect();
      const rp = pill.getBoundingClientRect();
      window.__rec.frames.push({
        t: +(performance.now() - window.__rec.t0).toFixed(1),
        bellD: +rb.width.toFixed(1),
        bellR: +rb.right.toFixed(1),
        pillL: +rp.left.toFixed(1),
        pillW: +rp.width.toFixed(1),
        gap: +(rp.left - rb.right).toFixed(1),
      });
      if (performance.now() - window.__rec.t0 < 2200) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
const collect = () => page.evaluate(() => window.__rec.frames);

const state = () =>
  page.evaluate(() => {
    const rail = document.querySelector(".rail");
    const bell = rail.querySelector(".rail-bell");
    const badge = rail.querySelector(".rail-badge");
    const glass = rail.querySelector(".rail-glass");
    const rim = rail.querySelector(".rail-rim");
    const cs = getComputedStyle(badge);
    return {
      state: rail.dataset.state,
      bellDisabled: bell.disabled,
      bellAriaHidden: bell.getAttribute("aria-hidden"),
      bellLabel: bell.getAttribute("aria-label"),
      badgeText: badge.textContent,
      badgeScale: cs.scale,
      badgeBg: cs.backgroundColor,
      badgeInk: cs.color,
      glassBF: getComputedStyle(glass).backdropFilter,
      glassMask: getComputedStyle(glass).maskImage.slice(0, 22),
      glassTint: getComputedStyle(glass).backgroundColor,
      rimMask: getComputedStyle(rim).maskImage.slice(0, 22),
      tabActive: getComputedStyle(rail.querySelector('.rail-tab[aria-current="page"]')).color,
      tabInactive: getComputedStyle(rail.querySelector('.rail-tab:not([aria-current])')).color,
      tabHeights: [...rail.querySelectorAll(".rail-tab")].map((t) => +t.getBoundingClientRect().height.toFixed(1)),
      iconCount: rail.querySelectorAll(".rail-bell svg, .rail-tab svg").length,
      libraryMounted: !!rail.querySelector(".lg-cover, .lg-layer, .rail-host"),
      neck: !!document.querySelector(".rail-neck"),
      contentFilters: [".rail-bell", ".rail-tabs", ".rail-tab"].every((s) => {
        const c = getComputedStyle(rail.querySelector(s));
        return c.filter === "none" && (c.backdropFilter === "none" || c.backdropFilter === "");
      }),
    };
  });

const report = {};
const mark = (m) => console.error("== " + m);

// --- 1. calm: capsule alone, centred, bell melted away ---------------------
report.calm = await state();
if (report.calm.state !== "calm") problems.push(`initial state ${report.calm.state}`);
if (!report.calm.bellDisabled || report.calm.bellAriaHidden !== "true") problems.push("calm: bell focusable/visible to AT");
if (report.calm.badgeScale !== "0") problems.push(`calm badge scale ${report.calm.badgeScale}`);
if (report.calm.libraryMounted) problems.push("calm: library glass still mounted on the rail");
if (report.calm.neck) problems.push("neck: a neck element exists");
if (!report.calm.contentFilters) problems.push("fusion: filter/backdrop-filter on rail content");
if (!report.calm.glassBF.includes("url(") && !report.calm.glassBF.includes("blur(")) problems.push(`lens: no backdrop-filter (${report.calm.glassBF})`);
if (!report.calm.glassMask.startsWith("url(")) problems.push("lens: silhouette mask missing");
if (!report.calm.rimMask.startsWith("url(")) problems.push("rim: specular mask missing");
if (Math.min(...report.calm.tabHeights) < 44) problems.push(`targets: tab height ${report.calm.tabHeights}`);
if (report.calm.iconCount !== 4) problems.push(`icons: ${report.calm.iconCount} svgs in the rail`);
// token wiring (light column of components/ios-tokens.css)
if (report.calm.tabActive !== "rgb(0, 96, 214)") problems.push(`token: selected tab ${report.calm.tabActive}`);
if (report.calm.tabInactive !== "rgba(60, 60, 67, 0.78)") problems.push(`token: inactive tab ${report.calm.tabInactive}`);
if (report.calm.glassTint !== "rgba(248, 248, 250, 0.66)") problems.push(`token: glass tint ${report.calm.glassTint}`);
if (report.calm.badgeBg !== "rgb(255, 159, 10)") problems.push(`token: badge ${report.calm.badgeBg}`);
mark("calm-shot");
await page.screenshot({ path: shot("00-full-calm.png") });
await page.screenshot({ path: shot("01-rail-calm.png"), clip });

// --- 2. ALERT: mail arrives, the droplet grows out of the cap --------------
mark("alert");
await startRecorder();
await page.click(".morph-switch");
await page.waitForTimeout(2200);
const openFrames = await collect();
report.alert = await state();
if (report.alert.state !== "alert") problems.push(`alert state ${report.alert.state}`);
if (report.alert.bellDisabled || report.alert.bellAriaHidden !== null) problems.push("alert: bell not live");
if (report.alert.badgeText !== "3" || report.alert.badgeScale !== "1") problems.push(`alert badge ${JSON.stringify(report.alert.badgeText)}/${report.alert.badgeScale}`);
await page.screenshot({ path: shot("00-full-alert.png") });
await page.screenshot({ path: shot("02-rail-alert.png"), clip });

// --- 3. CALM again: mail cleared, the droplet melts back -------------------
mark("calm-again");
await page.screenshot({ path: shot("03-before-cycle.png"), clip });
await startRecorder();
await page.click(".morph-switch");
await page.waitForTimeout(2200);
const closeFrames = await collect();
report.calmAgain = await state();
if (report.calmAgain.state !== "calm") problems.push(`calm again ${report.calmAgain.state}`);
if (!report.calmAgain.bellDisabled) problems.push("calm again: bell not disabled");
await page.screenshot({ path: shot("03-rail-calm-again.png"), clip });

// --- 4. spring geometry: contact mid-flight, clean 10px rest ---------------
for (const [dir, fr] of [["open", openFrames], ["close", closeFrames]]) {
  const gaps = fr.map((f) => f.gap);
  const penetration = Math.min(...gaps);
  const end = fr[fr.length - 1];
  if (dir === "open") {
    // the droplet is born INSIDE the cap (deeply negative gap) and parts
    // to the 10px resting gap
    if (penetration > -6) problems.push(`open: droplet never inside the cap (min gap ${penetration})`);
    if (Math.abs(end.gap - 10) > 1.5) problems.push(`open: resting gap ${end.gap}`);
    if (Math.abs(end.bellD - 56) > 1.5) problems.push(`open: resting bell ⌀ ${end.bellD}`);
  } else {
    if (end.bellD > 1) problems.push(`close: bell not melted (⌀ ${end.bellD})`);
  }
  report[`${dir}Gap`] = { min: penetration, end: end.gap, bellDEnd: end.bellD };
}

// --- 5. ghost diff: calm before vs calm after a full cycle -----------------
mark("ghost");
report.ghostAE = pixelDiff(shot("01-rail-calm.png"), shot("03-rail-calm-again.png"), shot("ghost-diff.png"));
if (report.ghostAE !== 0) problems.push(`ghost: ${report.ghostAE} differing pixels between calm rests`);

// --- 6. narrow viewport: the capsule keeps its side margins ----------------
await page.setViewportSize({ width: 320, height: 568 });
await page.waitForTimeout(700);
const narrow = await page.evaluate(() => {
  const r = document.querySelector(".rail").getBoundingClientRect();
  return { x: +r.x.toFixed(1), right: +r.right.toFixed(1), vw: window.innerWidth };
});
report.narrow = narrow;
if (narrow.x < 9.5 || narrow.vw - narrow.right < 9.5) problems.push(`narrow: rail margins ${narrow.x}/${narrow.vw - narrow.right}`);
// --- 5b. end-dark: the rail re-declares the tokens' dark column ------------
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(900);
const darkInk = await page.evaluate(() => ({
  active: getComputedStyle(document.querySelector('.rail-tab[aria-current="page"]')).color,
  inactive: getComputedStyle(document.querySelector('.rail-tab:not([aria-current])')).color,
  tint: getComputedStyle(document.querySelector(".rail-glass")).backgroundColor,
}));
report.endDark = darkInk;
if (darkInk.active !== "rgb(108, 178, 255)") problems.push(`end-dark: selected tab ${darkInk.active}`);
if (darkInk.inactive !== "rgba(235, 235, 245, 0.82)") problems.push(`end-dark: inactive tab ${darkInk.inactive}`);
if (darkInk.tint !== "rgba(34, 34, 38, 0.62)") problems.push(`end-dark: glass tint ${darkInk.tint}`);
await page.close();
await browser.close();

// --- 7. reduced motion: the spring collapses to a jump ---------------------
// (its own browser: closing a second live page in the same Lambda Chromium
// instance takes the whole browser down mid-backdrop-filter)
const browser2 = await chromium.launch({ executablePath: exe, args: [...sparticuz.args, "--no-sandbox"] });
const prm = await browser2.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
await prm.goto(URL, { waitUntil: "networkidle" });
await prm.waitForTimeout(2000);
await prm.evaluate(() => {
  const rail = document.querySelector(".rail");
  window.__prm = [];
  const bell = rail.querySelector(".rail-lift-bell");
  const tick = () => {
    window.__prm.push(+bell.getBoundingClientRect().width.toFixed(1));
    if (window.__prm.length < 40) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
await prm.click(".morph-switch");
await prm.waitForTimeout(900);
const prmSamples = await prm.evaluate(() => window.__prm);
const prmDistinct = [...new Set(prmSamples)].length;
report.prm = { distinct: prmDistinct, samples: prmSamples.slice(0, 8) };
if (prmDistinct > 3) problems.push(`reduced motion: spring still animates (${prmDistinct} poses)`);
await browser2.close();

console.log(JSON.stringify({ problems, ...report }, null, 1));
await browser.close();
process.exit(problems.length ? 1 : 0);
