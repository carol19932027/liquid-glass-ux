// Headless pass over the /impeccable live session on the project page:
// rest state must be the untouched original (rail visible, no ios-tab-bar),
// the toolbar must expose original + four variants with docked tune knobs,
// and every variant must pass the craft floors (44pt targets, >=4.5:1 label
// contrast on the composited glass, focus ring) in both languages and both
// appearances. Captures go to verify-artifacts/components/.
import { chromium } from "playwright-core";
import sparticuz from "@sparticuz/chromium";
import { mkdirSync } from "node:fs";

const URL = process.env.COMPONENTS_URL || "http://127.0.0.1:5173/";
const OUT = "verify-artifacts/components";
mkdirSync(OUT, { recursive: true });

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
  await p.waitForSelector(".impeccable-bar");
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
    toolbar: !!document.querySelector(".impeccable-bar"),
  };
  if (nav) {
    const cs = getComputedStyle(nav);
    const r = nav.getBoundingClientRect();
    out.bar = {
      w: Math.round(r.width),
      h: Math.round(r.height),
      left: Math.round(r.left),
      radius: cs.borderRadius,
      lift: /0px 8px 32px/.test(cs.boxShadow),
      rimLayers: (cs.boxShadow.match(/inset/g) || []).length,
      rimTop: Number((cs.boxShadow.match(/rgba\(255, 255, 255, ([\d.]+)\) 0px 1px/) || [])[1] || 0),
      rimSide: Number((cs.boxShadow.match(/rgba\(255, 255, 255, ([\d.]+)\) 0px -1px/) || [])[1] || 0),
      rimBorder: cs.borderTopWidth + " " + cs.borderTopStyle,
      backdrop: cs.backdropFilter || cs.webkitBackdropFilter,
      bg: cs.backgroundColor,
    };
    out.tabs = [...nav.querySelectorAll(".tab")].map((t) => {
      const tr = t.getBoundingClientRect();
      return {
        id: t.dataset.tab,
        w: Math.round(tr.width),
        h: Math.round(tr.height),
        label: t.querySelector("span") ? getComputedStyle(t.querySelector("span")).display : null,
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
      const [L, C, H] = m;
      const rad = (H * Math.PI) / 180;
      const alpha = c.includes("/") ? m[3] : 1;
      return [...oklabToRgb(L, C * Math.cos(rad), C * Math.sin(rad)), alpha];
    }
    if (c.startsWith("oklab")) {
      const m = c.match(/-?[\d.]+/g).map(Number);
      const [L, a, b] = m;
      const alpha = c.includes("/") ? m[3] : 1;
      return [...oklabToRgb(L, a, b), alpha];
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
  const nav = document
    .querySelector('[data-impeccable-variants="ios27tabbar"]')
    .querySelector("ios-tab-bar:not([hidden])")?.shadowRoot?.querySelector(".bar");
  const visibleNav = [...document.querySelectorAll('[data-impeccable-variant] ios-tab-bar')]
    .map((b) => b.shadowRoot.querySelector(".bar"))
    .find((n) => n && n.getBoundingClientRect().width > 0);
  const target = nav && nav.getBoundingClientRect().width > 0 ? nav : visibleNav;
  if (!target) return null;
  const page = over(parse(getComputedStyle(document.body).backgroundColor || "rgb(255,255,255)"), [255, 255, 255]);
  const dark = document.querySelector("section.dark");
  const under = dark && target.getBoundingClientRect().top > dark.getBoundingClientRect().top ? over(parse(getComputedStyle(dark).backgroundColor), page) : page;
  const glass = over(parse(getComputedStyle(target).backgroundColor), under);
  const tabs = [...target.querySelectorAll(".tab")];
  const active = tabs.find((t) => t.getAttribute("aria-current"));
  const inactive = tabs.find((t) => !t.getAttribute("aria-current"));
  return {
    glass: getComputedStyle(target).backgroundColor,
    activeColor: getComputedStyle(active).color,
    inactiveColor: getComputedStyle(inactive).color,
    dbg: {
      barTop: Math.round(target.getBoundingClientRect().top),
      darkTop: dark ? Math.round(dark.getBoundingClientRect().top) : null,
      bodyBg: getComputedStyle(document.body).backgroundColor,
      under: under.map(Math.round),
    },
    active: ratio(over(parse(getComputedStyle(active).color), glass), glass),
    inactive: ratio(over(parse(getComputedStyle(inactive).color), glass), glass),
  };
};

const pick = (i) => p.click(`.impeccable-bar .impeccable-variants > button:nth-child(${i + 1})`);

// --- boot ----------------------------------------------------------------
await p.goto(URL, { waitUntil: "networkidle" });
await p.waitForSelector(".impeccable-bar");
await p.waitForTimeout(300);

// rest state: original slot shows, page untouched
report.rest = await p.evaluate(PROBE);
if (!report.rest.railVisible) problems.push("rest: rail hidden");
if (report.rest.visibleKeys.join() !== "original") problems.push(`rest visible: ${report.rest.visibleKeys}`);
if (report.rest.bar) problems.push("rest: an ios-tab-bar is visible at rest");
if (!report.rest.toolbar) problems.push("live toolbar not mounted");
report.toolbar = await p.evaluate(() => {
  const bar = document.querySelector(".impeccable-bar");
  const wrapper = document.querySelector('[data-impeccable-variants="ios27tabbar"]');
  return {
    declared: Number(wrapper.dataset.impeccableVariantCount),
    variantDivs: wrapper.querySelectorAll(":scope > [data-impeccable-variant]:not([data-impeccable-variant='original'])").length,
    buttons: bar.querySelectorAll(".impeccable-variants > button").length,
    labels: [...bar.querySelectorAll(".impeccable-variants > button")].map((b) => b.textContent),
    knobs: [...bar.querySelectorAll(".impeccable-param label span")].map((s) => s.textContent),
    styleTag: !!wrapper.querySelector("style[data-impeccable-css]"),
  };
});
if (report.toolbar.variantDivs !== report.toolbar.declared) problems.push("variant count mismatch");
if (report.toolbar.buttons !== report.toolbar.declared + 1) problems.push("toolbar button count");
if (!report.toolbar.styleTag) problems.push("data-impeccable-css style tag missing");
if (report.toolbar.knobs.length) problems.push("knobs rendered on the original slot");
await p.screenshot({ path: `${OUT}/rest-original.png` });

// --- variant 1: capsule, fa/RTL ------------------------------------------
await pick(1);
await p.waitForTimeout(400);
const v1 = await p.evaluate(PROBE);
report.v1 = v1;
if (errors.length) problems.push(`page errors: ${errors.join(" | ")}`);
if (v1.railVisible) problems.push("v1: rail still visible under variant");
if (v1.visibleKeys.join() !== "1") problems.push(`v1 visible: ${v1.visibleKeys}`);
if (v1.tabs.length !== 3) problems.push(`v1 tabs ${v1.tabs.length}`);
if (v1.direction !== "rtl") problems.push(`v1 direction ${v1.direction}`);
if (v1.tabs.some((t) => t.w < 44 || t.h < 44)) problems.push("v1 sub-44pt targets");
if (!/blur\(18px\)/.test(v1.bar.backdrop)) problems.push(`v1 backdrop ${v1.bar.backdrop}`);
if (!v1.bar.lift || v1.bar.rimLayers < 4 || !(v1.bar.rimTop > v1.bar.rimSide && v1.bar.rimSide > 0))
  problems.push(`v1 material stack ${JSON.stringify(v1.bar)}`);
if (!/^1px solid/.test(v1.bar.rimBorder)) problems.push(`v1 rim border ${v1.bar.rimBorder}`);
await p.screenshot({ path: `${OUT}/v1-capsule-fa.png` });

// knobs drive --p-* on the variant root
report.knob = await p.evaluate(() => {
  const root = document.querySelector('[data-impeccable-variant="1"]');
  const range = document.querySelector(".impeccable-param input[type=range]");
  range.value = "8";
  range.dispatchEvent(new Event("input", { bubbles: true }));
  const nav = root.querySelector("ios-tab-bar").shadowRoot.querySelector(".bar");
  return { prop: root.style.getPropertyValue("--p-blur"), backdrop: getComputedStyle(nav).backdropFilter };
});
if (report.knob.prop !== "8" || !/blur\(8px\)/.test(report.knob.backdrop))
  problems.push(`blur knob: ${JSON.stringify(report.knob)}`);
report.specularKnob = await p.evaluate(() => {
  const root = document.querySelector('[data-impeccable-variant="1"]');
  root.style.setProperty("--p-specular", "0");
  const cs = getComputedStyle(root.querySelector("ios-tab-bar").shadowRoot.querySelector(".bar"));
  const out = { border: cs.borderTopColor };
  root.style.removeProperty("--p-specular");
  root.style.removeProperty("--p-blur");
  return out;
});
if (!/rgba\(255, 255, 255, 0\)/.test(report.specularKnob.border))
  problems.push(`specular knob: ${report.specularKnob.border}`);

// selection + keyboard focus ring
await p.evaluate(() => {
  const nav = document.querySelector('[data-impeccable-variant="1"] ios-tab-bar').shadowRoot.querySelector(".bar");
  const tabs = nav.querySelectorAll(".tab");
  tabs[0].click();
  tabs[0].focus();
});
await p.keyboard.press("ArrowLeft");
await p.waitForTimeout(150);
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
report.restored = await p.evaluate(
  () => !document.querySelector('[data-impeccable-variant="1"] ios-tab-bar').hasAttribute("minimized")
);
if (!report.restored) problems.push("capsule did not restore on scroll-up");

report.contrastLight = await p.evaluate(CONTRAST);
if (!report.contrastLight || report.contrastLight.inactive < 4.5 || report.contrastLight.active < 4.5)
  problems.push(`light contrast ${JSON.stringify(report.contrastLight)}`);

// --- variant 2: band ------------------------------------------------------
await pick(2);
await p.waitForTimeout(400);
const v2 = await p.evaluate(PROBE);
report.v2 = v2;
if (Math.abs(v2.bar.w - 390) > 2 || v2.bar.radius !== "0px") problems.push(`v2 band ${JSON.stringify(v2.bar)}`);
if (v2.tabs.some((t) => t.w < 44 || t.h < 44)) problems.push("v2 sub-44pt targets");
if (v2.tabs.some((t) => t.w < 100)) problems.push("v2 tabs not distributed");
await p.screenshot({ path: `${OUT}/v2-band-fa.png` });

// --- variant 3: capsule + search ------------------------------------------
await pick(3);
await p.waitForTimeout(400);
const v3 = await p.evaluate(PROBE);
report.v3 = v3;
if (v3.tabs.length !== 4) problems.push(`v3 tabs ${v3.tabs.length}`);
report.v3Divider = await p.evaluate(
  () => getComputedStyle(document.querySelector('[data-impeccable-variant="3"] ios-tab-bar').shadowRoot.querySelector(".divider")).display
);
if (report.v3Divider === "none") problems.push("v3 divider hidden");
await p.screenshot({ path: `${OUT}/v3-search-fa.png` });

// --- variant 4: dock -------------------------------------------------------
await pick(4);
await p.waitForTimeout(400);
const v4 = await p.evaluate(PROBE);
report.v4 = v4;
if (v4.tabs.some((t) => t.label !== "none")) problems.push(`v4 labels visible ${JSON.stringify(v4.tabs)}`);
if (v4.tabs.some((t) => t.w < 44 || t.h < 44)) problems.push("v4 sub-44pt targets");
await p.screenshot({ path: `${OUT}/v4-dock-fa.png` });

// --- back to original, then locale switch on a variant --------------------
await pick(0);
await p.waitForTimeout(300);
report.backToOriginal = await p.evaluate(PROBE);
if (!report.backToOriginal.railVisible) problems.push("original slot did not restore the rail");
await pick(1);
await p.waitForTimeout(300);
await p.click(".impeccable-lang");
await p.waitForTimeout(300);
report.langSwitch = await p.evaluate(PROBE);
report.langSwitch.knobLabels = await p.evaluate(
  () => [...document.querySelectorAll(".impeccable-param label span")].map((s) => s.textContent)
);
report.langSwitch.variantLabels = await p.evaluate(
  () => [...document.querySelectorAll(".impeccable-variants > button")].map((b) => b.textContent)
);
if (report.langSwitch.direction !== "ltr" || report.langSwitch.hostLang !== "en")
  problems.push(`locale switch: ${report.langSwitch.direction}/${report.langSwitch.hostLang}`);
if (report.langSwitch.tabs.map((t) => t.text).join() !== "Desktop,Apps,Assistant")
  problems.push(`en labels: ${report.langSwitch.tabs.map((t) => t.text)}`);
if (!/Original rail/.test(report.langSwitch.variantLabels.join())) problems.push("variant labels not switched");
if (!/Blur/.test(report.langSwitch.knobLabels.join())) problems.push("knob labels not switched");
await p.screenshot({ path: `${OUT}/v1-capsule-en.png` });
await p.click(".impeccable-lang");
await p.waitForTimeout(300);

// --- dark appearance --------------------------------------------------------
await emulate([{ name: "prefers-color-scheme", value: "dark" }]);
await pick(1);
await p.click('.impeccable-bar [data-act="reset"]');
// this page's dark zone is section.dark (scroll-driven, not scheme-driven):
// the dark appearance is only honest over it
await p.evaluate(() => document.querySelector("section.dark").scrollIntoView());
await p.waitForTimeout(300);
report.dark = await p.evaluate(PROBE);
report.contrastDark = await p.evaluate(CONTRAST);
if (!report.contrastDark || report.contrastDark.inactive < 4.5 || report.contrastDark.active < 4.5)
  problems.push(`dark contrast ${JSON.stringify(report.contrastDark)}`);
await p.screenshot({ path: `${OUT}/v1-capsule-dark.png` });

// --- reduced motion / reduced transparency ----------------------------------
await emulate([
  { name: "prefers-reduced-motion", value: "reduce" },
  { name: "prefers-reduced-transparency", value: "reduce" },
]);
await pick(1);
await p.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
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
