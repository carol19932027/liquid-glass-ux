// Headless pass over the /impeccable live session on the project page:
// rest state must be the untouched original (rail visible, no ios-tab-bar);
// the live chrome (lacquer bar + cycle dots + Tune drawer) must expose
// original + four variants with docked knobs; every variant must pass the
// craft floors (44pt targets, >=4.5:1 label contrast over the composited
// glass+lens, focus ring) in both languages and appearances; the iOS 26
// selection lens must seat under the active tab and spring between tabs.
// Captures go to verify-artifacts/components/.
import { chromium } from "playwright-core";
import sparticuz from "@sparticuz/chromium";
import { mkdirSync } from "node:fs";

const URL = process.env.COMPONENTS_URL || "http://127.0.0.1:5173/";
const OUT = "verify-artifacts/components";
mkdirSync(OUT, { recursive: true });

const BAR = "#impeccable-live-bar";
const DOTS = `${BAR} .impeccable-live-dots button`;

const exe = await sparticuz.executablePath();
const browser = await chromium.launch({
  executablePath: exe,
  args: [...sparticuz.args, "--no-sandbox"],
});
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: "fa-IR",
});
const p = await ctx.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(String(e)));
p.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
const cdp = await ctx.newCDPSession(p);
async function emulate(features) {
  await cdp.send("Emulation.setEmulatedMedia", { features });
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForSelector(BAR);
}

const problems = [];
const report = {};

const PROBE = () => {
  const wrapper = document.querySelector('[data-impeccable-variants="ios27tabbar"]');
  const slots = [...wrapper.querySelectorAll(":scope > [data-impeccable-variant]")];
  const visible = slots.filter((s) => s.style.display !== "none");
  const rail = document.querySelector(".rail");
  const barEl = visible.find((s) => s.querySelector("ios-tab-bar"))?.querySelector("ios-tab-bar");
  const nav = barEl?.shadowRoot?.querySelector(".bar");
  const out = {
    slotKeys: slots.map((s) => s.dataset.impeccableVariant),
    visibleKeys: visible.map((s) => s.dataset.impeccableVariant),
    railVisible: !!rail && rail.getBoundingClientRect().width > 0,
    toolbar: !!document.querySelector("#impeccable-live-bar"),
  };
  if (nav) {
    const cs = getComputedStyle(nav);
    const r = nav.getBoundingClientRect();
    out.bar = {
      w: Math.round(r.width),
      h: Math.round(r.height),
      radius: cs.borderRadius,
      lift: /0px 8px 32px/.test(cs.boxShadow),
      rimLayers: (cs.boxShadow.match(/inset/g) || []).length,
      rimTop: Number((cs.boxShadow.match(/rgba\(255, 255, 255, ([\d.]+)\) 0px 1px/) || [])[1] || 0),
      rimSide: Number((cs.boxShadow.match(/rgba\(255, 255, 255, ([\d.]+)\) -1px 0px/) || [])[1] || 0),
      rimBorder: cs.borderTopWidth + " " + cs.borderTopStyle,
      backdrop: cs.backdropFilter || cs.webkitBackdropFilter,
      bg: cs.backgroundColor,
    };
    const lens = nav.querySelector(".lens");
    const lcs = getComputedStyle(lens);
    const lr = lens.getBoundingClientRect();
    const active = nav.querySelector('[aria-current="page"]');
    const ar = active?.getBoundingClientRect();
    out.lens = {
      display: lcs.display,
      opacity: lcs.opacity,
      dx: ar ? Math.round(lr.left - ar.left) : null,
      dw: ar ? Math.round(lr.width - ar.width) : null,
      left: Math.round(lr.left),
      w: Math.round(lr.width),
    };
    out.tabs = [...nav.querySelectorAll(".tab")].map((t) => {
      const tr = t.getBoundingClientRect();
      const span = t.querySelector("span");
      const svg = t.querySelector("svg");
      return {
        id: t.dataset.tab,
        w: Math.round(tr.width),
        h: Math.round(tr.height),
        label: span ? getComputedStyle(span).display : null,
        filled: !!svg?.querySelector(".f"),
        stroked: !!svg?.querySelector(".s"),
        text: t.textContent.trim(),
        aria: t.getAttribute("aria-current"),
      };
    });
    out.direction = getComputedStyle(barEl).direction;
    out.hostLang = barEl.getAttribute("lang");
  }
  return out;
};

const CONTRAST = () => {
  const oklabToRgb = (L, a, b) => {
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.291485548 * b;
    const l = l_ ** 3, mm = m_ ** 3, ss = s_ ** 3;
    return [
      4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * ss,
      -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * ss,
      -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * ss,
    ].map((v) => Math.max(0, Math.min(1, v)) * 255);
  };
  const parse = (c) => {
    if (c.startsWith("oklch")) {
      const m = c.match(/-?[\d.]+/g).map(Number);
      const [L, Cc, H] = m;
      const rad = (H * Math.PI) / 180;
      return [...oklabToRgb(L, Cc * Math.cos(rad), Cc * Math.sin(rad)), c.includes("/") ? m[3] : 1];
    }
    if (c.startsWith("oklab")) {
      const m = c.match(/-?[\d.]+/g).map(Number);
      return [...oklabToRgb(m[0], m[1], m[2]), c.includes("/") ? m[3] : 1];
    }
    const m = c.match(/[\d.]+/g).map(Number);
    return [m[0], m[1], m[2], m.length > 3 ? m[3] : 1];
  };
  const over = (fg, bg) => fg.slice(0, 3).map((v, i) => v * fg[3] + bg[i] * (1 - fg[3]));
  const lum = (rgb) => {
    const [r, g, b] = rgb.map((v) => {
      v /= 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
    return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
  };
  const nav = [...document.querySelectorAll('[data-impeccable-variant] ios-tab-bar')]
    .map((b) => b.shadowRoot.querySelector(".bar"))
    .find((n) => n && n.getBoundingClientRect().width > 0);
  if (!nav) return null;
  const page = over(parse(getComputedStyle(document.body).backgroundColor || "rgb(255,255,255)"), [255, 255, 255]);
  const dark = document.querySelector("section.dark");
  const under =
    dark && nav.getBoundingClientRect().top > dark.getBoundingClientRect().top
      ? over(parse(getComputedStyle(dark).backgroundColor), page)
      : page;
  const glass = over(parse(getComputedStyle(nav).backgroundColor), under);
  const lensEl = nav.querySelector(".lens");
  const lensOn = getComputedStyle(lensEl).display !== "none" && getComputedStyle(lensEl).opacity !== "0";
  const lens = lensOn ? over(parse(getComputedStyle(lensEl).backgroundColor), glass) : glass;
  const tabs = [...nav.querySelectorAll(".tab")];
  const active = tabs.find((t) => t.getAttribute("aria-current"));
  const inactive = tabs.find((t) => !t.getAttribute("aria-current"));
  return {
    glass: getComputedStyle(nav).backgroundColor,
    lensOn,
    active: ratio(over(parse(getComputedStyle(active).color), lens), lens),
    inactive: ratio(over(parse(getComputedStyle(inactive).color), glass), glass),
  };
};

const pick = (i) => p.click(`${DOTS} >> nth=${i}`);

// --- boot -----------------------------------------------------------------
await p.goto(URL, { waitUntil: "networkidle" });
await p.waitForSelector(BAR);
await p.waitForTimeout(400);

report.rest = await p.evaluate(PROBE);
if (!report.rest.railVisible) problems.push("rest: rail hidden");
if (report.rest.visibleKeys.join() !== "original") problems.push(`rest visible: ${report.rest.visibleKeys}`);
if (report.rest.bar) problems.push("rest: an ios-tab-bar is visible at rest");
if (!report.rest.toolbar) problems.push("live bar not mounted");
report.chrome = await p.evaluate(() => {
  const bar = document.querySelector("#impeccable-live-bar");
  const cs = getComputedStyle(bar);
  const wrapper = document.querySelector('[data-impeccable-variants="ios27tabbar"]');
  return {
    bottom: cs.bottom,
    radius: cs.borderRadius,
    bg: cs.backgroundColor,
    shadow: cs.boxShadow,
    brand: !!bar.querySelector(".impeccable-live-brand svg"),
    agentDot: !!bar.querySelector(".impeccable-live-brand .dot"),
    dots: bar.querySelectorAll(".impeccable-live-dots button").length,
    declared: Number(wrapper.dataset.impeccableVariantCount),
    styleTag: !!wrapper.querySelector("style[data-impeccable-css]"),
    tune: !!document.querySelector("#impeccable-live-tune"),
  };
});
if (report.chrome.dots !== report.chrome.declared + 1) problems.push("cycle dots count");
if (report.chrome.radius !== "8px") problems.push(`bar radius ${report.chrome.radius}`);
if (!/16px 36px/.test(report.chrome.shadow)) problems.push(`bar shadow ${report.chrome.shadow}`);
if (!report.chrome.agentDot) problems.push("agent dot missing");
await p.screenshot({ path: `${OUT}/rest-original.png` });

// --- variant 1: capsule, fa/RTL --------------------------------------------
await pick(1);
await p.waitForTimeout(500);
const v1 = await p.evaluate(PROBE);
report.v1 = v1;
if (errors.length) problems.push(`page errors: ${errors.join(" | ")}`);
if (v1.railVisible) problems.push("v1: rail still visible under variant");
if (v1.tabs.length !== 3) problems.push(`v1 tabs ${v1.tabs.length}`);
if (v1.direction !== "rtl") problems.push(`v1 direction ${v1.direction}`);
if (v1.tabs.some((t) => t.w < 44 || t.h < 44)) problems.push("v1 sub-44pt targets");
if (!v1.tabs.every((t) => t.filled)) problems.push("v1 symbols not filled");
if (!/blur\(18px\)/.test(v1.bar.backdrop)) problems.push(`v1 backdrop ${v1.bar.backdrop}`);
if (!v1.bar.lift || v1.bar.rimLayers < 4 || !(v1.bar.rimTop > v1.bar.rimSide && v1.bar.rimSide > 0))
  problems.push(`v1 material stack ${JSON.stringify(v1.bar)}`);
if (!/^1px solid/.test(v1.bar.rimBorder)) problems.push(`v1 rim border ${v1.bar.rimBorder}`);
// native proportions: full-width floating capsule with side margins
if (v1.bar.w < 360 || v1.bar.w > 372) problems.push(`v1 capsule width ${v1.bar.w}`);
if (v1.bar.h < 60 || v1.bar.h > 70) problems.push(`v1 capsule height ${v1.bar.h}`);
// the lens seats under the active tab
if (v1.lens.opacity !== "1" || Math.abs(v1.lens.dx + 3) > 2 || Math.abs(v1.lens.dw - 6) > 2)
  problems.push(`v1 lens seating ${JSON.stringify(v1.lens)}`);
await p.screenshot({ path: `${OUT}/v1-capsule-fa.png` });

// lens springs to another tab
const lensBefore = v1.lens.left;
await p.evaluate(() => {
  document
    .querySelector('[data-impeccable-variant="1"] ios-tab-bar')
    .shadowRoot.querySelectorAll(".tab")[2]
    .click();
});
await p.waitForTimeout(500);
const lensAfter = await p.evaluate(
  () =>
    document.querySelector('[data-impeccable-variant="1"] ios-tab-bar').shadowRoot.querySelector(".lens")
      .getBoundingClientRect().left
);
report.lensMove = { before: lensBefore, after: Math.round(lensAfter) };
if (Math.abs(report.lensMove.after - lensBefore) < 20) problems.push("lens did not move on selection");

// --- Tune drawer + knobs ----------------------------------------------------
await p.click("#impeccable-live-tune");
await p.waitForTimeout(500);
report.tune = await p.evaluate(() => {
  const panel = document.querySelector("#impeccable-live-params");
  const cs = getComputedStyle(panel);
  const bar = document.querySelector("#impeccable-live-bar").getBoundingClientRect();
  const pr = panel.getBoundingClientRect();
  return {
    open: panel.dataset.open,
    clip: cs.clipPath,
    above: Math.round(bar.top - pr.bottom),
    widthDelta: Math.round(pr.width - bar.width),
    knobs: [...panel.querySelectorAll(".impeccable-live-knob .head span:first-child")].map((s) => s.textContent),
  };
});
if (report.tune.open !== "true") problems.push("tune drawer did not open");
if (report.tune.knobs.length !== 4) problems.push(`tune knobs ${report.tune.knobs.length}`);
if (report.tune.above < -2 || report.tune.above > 3) problems.push(`tune not flush above bar: ${report.tune.above}`);

// blur knob to 8 via keyboard on the track
const tracks = p.locator(".impeccable-live-track");
await tracks.nth(0).focus();
for (let i = 0; i < 10; i++) await p.keyboard.press("ArrowLeft");
report.knob = await p.evaluate(() => {
  const root = document.querySelector('[data-impeccable-variant="1"]');
  const nav = root.querySelector("ios-tab-bar").shadowRoot.querySelector(".bar");
  return { prop: root.style.getPropertyValue("--p-blur"), backdrop: getComputedStyle(nav).backdropFilter };
});
if (report.knob.prop !== "8" || !/blur\(8px\)/.test(report.knob.backdrop))
  problems.push(`blur knob: ${JSON.stringify(report.knob)}`);
// specular knob to 0 zeroes the rim
await tracks.nth(2).focus();
await p.keyboard.press("Home");
report.specularKnob = await p.evaluate(() => {
  const root = document.querySelector('[data-impeccable-variant="1"]');
  return getComputedStyle(root.querySelector("ios-tab-bar").shadowRoot.querySelector(".bar")).borderTopColor;
});
if (!/rgba\(255, 255, 255, 0\)/.test(report.specularKnob)) problems.push(`specular knob: ${report.specularKnob}`);
await p.click(`#${"impeccable-live-params"} .impeccable-live-reset`);
await p.waitForTimeout(200);
await p.screenshot({ path: `${OUT}/tune-open-fa.png` });
await p.click("#impeccable-live-tune");
await p.waitForTimeout(400);

// selection + keyboard focus ring
await p.evaluate(() => {
  const nav = document.querySelector('[data-impeccable-variant="1"] ios-tab-bar').shadowRoot.querySelector(".bar");
  const tabs = nav.querySelectorAll(".tab");
  tabs[0].click();
  tabs[0].focus();
});
await p.keyboard.press("ArrowLeft");
await p.waitForTimeout(200);
report.select = await p.evaluate(() => {
  const nav = document.querySelector('[data-impeccable-variant="1"] ios-tab-bar').shadowRoot.querySelector(".bar");
  const tabs = [...nav.querySelectorAll(".tab")];
  const focused = tabs.find((t) => t.matches(":focus"));
  return {
    current: tabs.map((t) => t.getAttribute("aria-current")),
    focusVisible: !!focused && focused.matches(":focus-visible"),
    outline: focused ? getComputedStyle(focused).outlineWidth + " " + getComputedStyle(focused).outlineColor : null,
  };
});
if (report.select.current.filter(Boolean).length !== 1) problems.push("selection not exclusive");
if (!report.select.focusVisible || !/^2px /.test(report.select.outline || ""))
  problems.push(`focus ring: ${JSON.stringify(report.select)}`);

// minimize on scroll-down, capsule only
await p.evaluate(() => window.scrollTo({ top: 600, behavior: "instant" }));
await p.waitForTimeout(400);
report.minimized = await p.evaluate(
  () => document.querySelector('[data-impeccable-variant="1"] ios-tab-bar').hasAttribute("minimized")
);
if (!report.minimized) problems.push("capsule did not minimize on scroll-down");
await p.screenshot({ path: `${OUT}/v1-capsule-minimized-fa.png` });
await p.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
await p.waitForTimeout(400);

report.contrastLight = await p.evaluate(CONTRAST);
if (!report.contrastLight || report.contrastLight.inactive < 4.5 || report.contrastLight.active < 4.5)
  problems.push(`light contrast ${JSON.stringify(report.contrastLight)}`);

// --- variant 2: band (classic, no lens) --------------------------------------
await pick(2);
await p.waitForTimeout(500);
const v2 = await p.evaluate(PROBE);
report.v2 = v2;
if (Math.abs(v2.bar.w - 390) > 2 || v2.bar.radius !== "0px") problems.push(`v2 band ${JSON.stringify(v2.bar)}`);
if (v2.tabs.some((t) => t.w < 44 || t.h < 44)) problems.push("v2 sub-44pt targets");
if (v2.lens.display !== "none") problems.push("v2 band shows a lens");
await p.screenshot({ path: `${OUT}/v2-band-fa.png` });

// --- variant 3: capsule + search ---------------------------------------------
await pick(3);
await p.waitForTimeout(500);
const v3 = await p.evaluate(PROBE);
report.v3 = v3;
if (v3.tabs.length !== 4) problems.push(`v3 tabs ${v3.tabs.length}`);
if (!v3.tabs[3].stroked) problems.push("v3 search glyph should stay stroked");
report.v3Divider = await p.evaluate(
  () => getComputedStyle(document.querySelector('[data-impeccable-variant="3"] ios-tab-bar').shadowRoot.querySelector(".divider")).display
);
if (report.v3Divider === "none") problems.push("v3 divider hidden");
await p.screenshot({ path: `${OUT}/v3-search-fa.png` });

// --- variant 4: dock -----------------------------------------------------------
await pick(4);
await p.waitForTimeout(500);
const v4 = await p.evaluate(PROBE);
report.v4 = v4;
if (v4.tabs.some((t) => t.label !== "none")) problems.push(`v4 labels visible ${JSON.stringify(v4.tabs)}`);
if (v4.tabs.some((t) => t.w < 44 || t.h < 44)) problems.push("v4 sub-44pt targets");
if (v4.bar.w > 200) problems.push(`v4 dock not content-hugged: ${v4.bar.w}`);
await p.screenshot({ path: `${OUT}/v4-dock-fa.png` });

// --- back to original, locale switch -------------------------------------------
await pick(0);
await p.waitForTimeout(300);
report.backToOriginal = await p.evaluate(PROBE);
if (!report.backToOriginal.railVisible) problems.push("original slot did not restore the rail");
await pick(1);
await p.waitForTimeout(300);
await p.click("#impeccable-live-lang");
await p.waitForTimeout(400);
report.langSwitch = await p.evaluate(PROBE);
await p.click("#impeccable-live-tune");
await p.waitForTimeout(400);
report.langSwitch.knobLabels = await p.evaluate(
  () => [...document.querySelectorAll(".impeccable-live-knob .head span:first-child")].map((s) => s.textContent)
);
await p.click("#impeccable-live-tune");
if (report.langSwitch.direction !== "ltr" || report.langSwitch.hostLang !== "en")
  problems.push(`locale switch: ${report.langSwitch.direction}/${report.langSwitch.hostLang}`);
if (report.langSwitch.tabs.map((t) => t.text).join() !== "Desktop,Apps,Assistant")
  problems.push(`en labels: ${report.langSwitch.tabs.map((t) => t.text)}`);
if (!/Blur/.test(report.langSwitch.knobLabels.join())) problems.push("knob labels not switched");
await p.screenshot({ path: `${OUT}/v1-capsule-en.png` });
await p.click("#impeccable-live-lang");
await p.waitForTimeout(300);

// --- dark appearance over the page's dark zone ----------------------------------
await emulate([{ name: "prefers-color-scheme", value: "dark" }]);
await pick(1);
await p.evaluate(() => document.querySelector("section.dark").scrollIntoView());
await p.waitForTimeout(400);
report.dark = await p.evaluate(PROBE);
report.contrastDark = await p.evaluate(CONTRAST);
if (!report.contrastDark || report.contrastDark.inactive < 4.5 || report.contrastDark.active < 4.5)
  problems.push(`dark contrast ${JSON.stringify(report.contrastDark)}`);
await p.screenshot({ path: `${OUT}/v1-capsule-dark.png` });

// --- reduced motion / reduced transparency ---------------------------------------
await emulate([
  { name: "prefers-reduced-motion", value: "reduce" },
  { name: "prefers-reduced-transparency", value: "reduce" },
]);
await pick(1);
await p.evaluate(() => window.scrollTo({ top: 600, behavior: "instant" }));
await p.waitForTimeout(300);
report.reduced = await p.evaluate(() => ({
  minimized: document.querySelector('[data-impeccable-variant="1"] ios-tab-bar').hasAttribute("minimized"),
  bg: getComputedStyle(
    document.querySelector('[data-impeccable-variant="1"] ios-tab-bar').shadowRoot.querySelector(".bar")
  ).backgroundColor,
}));
if (report.reduced.minimized) problems.push("minimize ran under prefers-reduced-motion");
await p.screenshot({ path: `${OUT}/v1-reduced.png` });

await browser.close();

report.pageErrors = errors;
report.problems = problems;
console.log(JSON.stringify(report, null, 2));
process.exit(problems.length ? 1 : 0);
