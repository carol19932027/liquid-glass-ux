// Navigation-rail review probe (read-only): geometry, hit targets, rendered
// ink contrast per item, a11y wiring, focus order, platform fonts, reduced
// motion and small-viewport behaviour. Writes numbers + crops to
// verify-artifacts/review-*. It changes nothing on the page.
//
//   npm ci && npm run build && npm run preview   # :4173 serves dist
//   npm run review:rail
//
// Same bootstrap as verify-rail-geometry.mjs (@sparticuz/chromium + the NSS
// libs from its own al2023.tar.br). Findings are discussed in
// docs/rail-review.md.
import { chromium } from "playwright-core";
import sparticuz from "@sparticuz/chromium";
import { brotliDecompressSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const OUT = "verify-artifacts";
const URL = process.env.RAIL_URL ?? "http://127.0.0.1:4173/";

const LIB = "/tmp/al2023/lib";
if (!fs.existsSync(`${LIB}/libnss3.so`)) {
  fs.mkdirSync("/tmp/al2023", { recursive: true });
  fs.writeFileSync("/tmp/al2023.tar", brotliDecompressSync(fs.readFileSync("node_modules/@sparticuz/chromium/bin/al2023.tar.br")));
  execFileSync("tar", ["xf", "/tmp/al2023.tar", "-C", "/tmp/al2023"]);
}
process.env.LD_LIBRARY_PATH = [LIB, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":");

const browser = await chromium.launch({
  executablePath: await sparticuz.executablePath(),
  args: [...sparticuz.args, "--no-sandbox"],
});
const out = {};

/* WCAG-ish contrast from rendered pixels inside a tight clip around one
   item: dark ink tail (p02) and bright ink tail (p98) against the glass
   median. Which tail is "the ink" depends on the appearance, so both are
   reported. */
const itemStats = async (page, selector, name, shot) => {
  const b = await page.locator(selector).first().boundingBox();
  if (!b) return (out[name] = null);
  const clip = { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) };
  const png = await page.screenshot({ clip });
  if (shot) fs.writeFileSync(`${OUT}/review-${shot}.png`, png);
  out[name] = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = "data:image/png;base64," + b64;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    const lin = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    const L = [];
    for (let i = 0; i < data.length; i += 4) L.push(0.2126 * lin(data[i]) + 0.7152 * lin(data[i + 1]) + 0.0722 * lin(data[i + 2]));
    L.sort((a, b) => a - b);
    const q = (p) => L[Math.min(L.length - 1, Math.floor(p * L.length))];
    const r = (a, b) => +(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2));
    return { p02: +q(0.02).toFixed(3), median: +q(0.5).toFixed(3), p98: +q(0.98).toFixed(3), darkInkVsGlass: r(q(0.02), q(0.5)), lightInkVsGlass: r(q(0.98), q(0.5)) };
  }, png.toString("base64"));
};

const geometry = (page) =>
  page.evaluate(() => {
    const rr = (el) => {
      const r = el.getBoundingClientRect();
      return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
    };
    const rail = document.querySelector(".rail");
    const tabs = [...document.querySelectorAll(".rail-tab")];
    return {
      state: rail.dataset.state,
      rail: { ...rr(rail), bottom: getComputedStyle(rail).bottom, ink: getComputedStyle(rail).color },
      morph: { ...rr(document.querySelector(".rail-morph")), visibility: getComputedStyle(document.querySelector(".rail-morph")).visibility, href: document.querySelector(".rail-morph").getAttribute("href"), ariaHidden: document.querySelector(".rail-morph").getAttribute("aria-hidden") },
      icon: rr(document.querySelector(".rail-icon svg")),
      badge: { ...rr(document.querySelector(".rail-badge")), bg: getComputedStyle(document.querySelector(".rail-badge")).backgroundColor, font: getComputedStyle(document.querySelector(".rail-badge")).fontSize, text: document.querySelector(".rail-badge").textContent },
      tabs: tabs.map((t) => ({ label: t.querySelector("span").textContent, ...rr(t), selected: t.getAttribute("aria-selected"), controls: t.getAttribute("aria-controls"), icon: !!t.querySelector("svg") })),
      tabsHostChildren: [...document.querySelector(".rail-tabs").children].map((c) => `${c.tagName.toLowerCase()}.${String(c.className).split(" ")[0] || "-"}${c.getAttribute("aria-hidden") ? "[aria-hidden]" : ""}`),
      navLabel: rail.getAttribute("aria-label"),
      tablistLabel: document.querySelector(".rail-tabs").getAttribute("aria-label"),
    };
  });

const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

// ---- light section, calm ---------------------------------------------------
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(700);
out.lightCalm = await geometry(page);
await itemStats(page, '.rail-tab[aria-selected="true"]', "lightSelectedTab", "tab-selected-light");
await itemStats(page, '.rail-tab[aria-selected="false"]', "lightUnselectedTab", "tab-unselected-light");
await itemStats(page, ".rail-tabs", "lightPill", "pill-light");

// ---- light section, alert ---------------------------------------------------
await page.click(".morph-switch-track");
await page.waitForTimeout(1100);
out.lightAlert = await geometry(page);
await itemStats(page, ".rail-morph", "lightBell", "bell-light");
await itemStats(page, ".rail-badge", "lightBadge", "badge-light");

// ---- platform font actually rendering the Persian label --------------------
const cdp = await page.context().newCDPSession(page);
await cdp.send("DOM.enable");
await cdp.send("CSS.enable");
const { root } = await cdp.send("DOM.getDocument");
const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: '.rail-tab[aria-selected="true"] > span' });
out.platformFontLabel = await cdp.send("CSS.getPlatformFontsForNode", { nodeId }).then((r) => r.fonts).catch(() => null);

// ---- dark section (scroll to the end, html.end-dark) ------------------------
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(1300);
out.darkAlert = await geometry(page);
await itemStats(page, '.rail-tab[aria-selected="true"]', "darkSelectedTab", "tab-selected-dark");
await itemStats(page, '.rail-tab[aria-selected="false"]', "darkUnselectedTab", "tab-unselected-dark");
await itemStats(page, ".rail-badge", "darkBadge", "badge-dark");
await itemStats(page, ".rail-icon", "darkBell", "bell-dark");

// ---- reduced motion ----------------------------------------------------------
await page.emulateMedia({ reducedMotion: "reduce" });
await page.waitForTimeout(300);
out.reducedMotion = await page.evaluate(() => {
  const cs = (s) => getComputedStyle(document.querySelector(s));
  return { tabs: cs(".rail-tabs").transitionDuration, morph: cs(".rail-morph").transitionDuration, icon: cs(".rail-icon").transitionDuration, anim: cs(".rail-morph").animationName };
});
await page.emulateMedia({ reducedMotion: null });

// ---- small viewports ---------------------------------------------------------
for (const vp of [
  { name: "viewport390", width: 390, height: 844 },
  { name: "viewport320", width: 320, height: 568 },
]) {
  await page.setViewportSize({ width: vp.width, height: vp.height });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(900);
  out[vp.name] = await page.evaluate((w) => {
    const r = document.querySelector(".rail").getBoundingClientRect();
    return {
      vw: w,
      rail: { x: +r.x.toFixed(1), w: +r.width.toFixed(1), right: +r.right.toFixed(1), bottomGap: +(window.innerHeight - r.bottom).toFixed(1) },
      clipLeft: +Math.min(0, r.x).toFixed(1),
      clipRight: +Math.max(0, r.right - w).toFixed(1),
      tabHeights: [...document.querySelectorAll(".rail-tab")].map((t) => +t.getBoundingClientRect().height.toFixed(1)),
    };
  }, vp.width);
  await page.screenshot({ path: `${OUT}/review-${vp.name}.png`, clip: { x: 0, y: Math.max(0, vp.height - 220), width: vp.width, height: 220 } });
}

await browser.close();
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(`${OUT}/review.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
