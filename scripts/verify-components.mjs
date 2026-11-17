// Headless pass over the components playground: renders each of the four
// impeccable variants of <ios-tab-bar>, checks the toolbar contract, the
// craft-floor numbers (44pt targets, label contrast, focus visibility) and
// both language directions. Captures go to verify-artifacts/components/.
import { chromium } from "playwright-core";
import sparticuz from "@sparticuz/chromium";
import { mkdirSync } from "node:fs";

const URL = process.env.COMPONENTS_URL || "http://127.0.0.1:4180/components/demo.html";
const OUT = "verify-artifacts/components";
mkdirSync(OUT, { recursive: true });

const exe = await sparticuz.executablePath();
const browser = await chromium.launch({
  executablePath: exe,
  args: [...sparticuz.args, "--no-sandbox"],
});
const problems = [];
const report = {};

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
  await p.waitForSelector("ios-tab-bar");
}
async function page() {
  await p.goto(URL, { waitUntil: "networkidle" });
  await p.waitForSelector("ios-tab-bar");
}

async function barBox(p) {
  return p.evaluate(() => {
    const host = document.querySelector('[style*="contents"] > div:not([style*="none"]) ios-tab-bar');
    const nav = host.shadowRoot.querySelector(".bar");
    const tabs = [...nav.querySelectorAll(".tab")].map((t) => {
      const r = t.getBoundingClientRect();
      return { id: t.dataset.tab, w: Math.round(r.width), h: Math.round(r.height), label: t.textContent.trim(), aria: t.getAttribute("aria-current") };
    });
    const r = nav.getBoundingClientRect();
    const cs = getComputedStyle(nav);
    return {
      bar: { w: Math.round(r.width), h: Math.round(r.height), left: Math.round(r.left), radius: cs.borderRadius },
      backdrop: cs.backdropFilter || cs.webkitBackdropFilter,
      bg: cs.backgroundColor,
      lift: /0px 8px 32px/.test(cs.boxShadow),
      rimLayers: (cs.boxShadow.match(/inset/g) || []).length,
      rimTop: Number((cs.boxShadow.match(/rgba\(255, 255, 255, ([\d.]+)\) 0px 1px/) || [])[1] || 0),
      rimSide: Number((cs.boxShadow.match(/rgba\(255, 255, 255, ([\d.]+)\) 0px -1px/) || [])[1] || 0),
      rimBorder: cs.borderTopWidth + " " + cs.borderTopStyle,
      tabs,
      direction: getComputedStyle(host).direction,
    };
  });
}

// --- toolbar contract ---------------------------------------------------
await page();
report.toolbar = await p.evaluate(() => {
  const bar = document.querySelector(".impeccable-bar");
  const wrapper = document.querySelector("[data-impeccable-variants]");
  return {
    wrapper: wrapper?.dataset.impeccableVariants,
    declared: Number(wrapper?.dataset.impeccableVariantCount),
    variantDivs: [...wrapper.children].filter((c) => c.dataset.impeccableVariant).length,
    visible: [...wrapper.children].filter((c) => c.dataset.impeccableVariant && c.style.display !== "none").map(
      (c) => c.dataset.impeccableVariant
    ),
    variantButtons: bar ? bar.querySelectorAll(".impeccable-variants > button").length : 0,
    knobs: bar ? bar.querySelectorAll(".impeccable-params input, .impeccable-params button").length : 0,
    knobLabels: bar ? [...bar.querySelectorAll(".impeccable-param label span")].map((s) => s.textContent) : [],
    toolbar: !!bar,
  };
});
if (report.toolbar.variantDivs !== report.toolbar.declared)
  problems.push(`variant divs ${report.toolbar.variantDivs} != declared ${report.toolbar.declared}`);
if (report.toolbar.visible.length !== 1) problems.push(`visible variants: ${report.toolbar.visible.join(",")}`);
if (!report.toolbar.toolbar) problems.push("live toolbar not mounted");

// --- variant 1: capsule, fa/RTL ----------------------------------------
const v1 = await barBox(p);
report.v1 = v1;
if (errors.length) problems.push(`v1 page errors: ${errors.join(" | ")}`);
if (v1.tabs.length !== 3) problems.push(`v1 tabs ${v1.tabs.length}`);
if (v1.direction !== "rtl") problems.push(`v1 direction ${v1.direction}`);
const small = v1.tabs.filter((t) => t.w < 44 || t.h < 44);
if (small.length) problems.push(`v1 sub-44pt targets: ${JSON.stringify(small)}`);
if (!/blur\(18px\)/.test(v1.backdrop)) problems.push(`v1 backdrop ${v1.backdrop}`);
if (!v1.lift) problems.push("v1 lift shadow missing");
if (v1.rimLayers < 4) problems.push(`v1 specular rim layers ${v1.rimLayers}`);
if (!(v1.rimTop > v1.rimSide && v1.rimSide > 0))
  problems.push(`v1 rim not top-weighted: top ${v1.rimTop} vs side ${v1.rimSide}`);
if (!/^1px solid/.test(v1.rimBorder)) problems.push(`v1 rim border ${v1.rimBorder}`);
await p.screenshot({ path: `${OUT}/v1-capsule-fa.png` });

// knob drives --p-* on the variant root
const knobCheck = await p.evaluate(() => {
  const root = document.querySelector('[data-impeccable-variant="1"]');
  const range = document.querySelector(".impeccable-param input[type=range]");
  range.value = "8";
  range.dispatchEvent(new Event("input", { bubbles: true }));
  const nav = root.querySelector("ios-tab-bar").shadowRoot.querySelector(".bar");
  return { prop: root.style.getPropertyValue("--p-blur"), backdrop: getComputedStyle(nav).backdropFilter };
});
report.knob = knobCheck;
if (knobCheck.prop !== "8") problems.push(`knob did not set --p-blur (got ${knobCheck.prop})`);
if (!/blur\(8px\)/.test(knobCheck.backdrop)) problems.push(`knob blur not applied: ${knobCheck.backdrop}`);

const specCheck = await p.evaluate(() => {
  const root = document.querySelector('[data-impeccable-variant="1"]');
  root.style.setProperty("--p-specular", "0");
  const nav = root.querySelector("ios-tab-bar").shadowRoot.querySelector(".bar");
  const cs = getComputedStyle(nav);
  const out = { border: cs.borderTopColor, inset: (cs.boxShadow.match(/inset/g) || []).length };
  root.style.removeProperty("--p-specular");
  root.style.removeProperty("--p-blur");
  return out;
});
report.specularKnob = specCheck;
if (!/rgba\(255, 255, 255, 0\)/.test(specCheck.border))
  problems.push(`specular knob did not zero the rim: ${specCheck.border}`);

// selection + focus
const selectCheck = await p.evaluate(() => {
  const nav = document.querySelector('[data-impeccable-variant="1"] ios-tab-bar').shadowRoot.querySelector(".bar");
  const tabs = [...nav.querySelectorAll(".tab")];
  tabs[1].click();
  const after = [...nav.querySelectorAll(".tab")].map((t) => t.getAttribute("aria-current"));
  tabs[1].focus();
  const cs = getComputedStyle(tabs[1]);
  return { current: after, color: cs.color, outline: cs.outlineWidth + " " + cs.outlineColor };
});
report.select = selectCheck;
if (selectCheck.current.filter(Boolean).length !== 1) problems.push(`selection: ${selectCheck.current}`);

// --- variant 2: band ----------------------------------------------------
await p.click('.impeccable-bar .impeccable-variants > button:nth-child(2)');
await p.waitForTimeout(400);
const v2 = await barBox(p);
report.v2 = v2;
if (Math.abs(v2.bar.w - 390) > 2) problems.push(`v2 band not edge-to-edge: ${v2.bar.w}`);
if (v2.bar.radius !== "0px") problems.push(`v2 radius ${v2.bar.radius}`);
if (v2.tabs.some((t) => t.w < 44 || t.h < 44)) problems.push("v2 sub-44pt targets");
await p.screenshot({ path: `${OUT}/v2-band-fa.png` });

// --- variant 3: capsule + search ---------------------------------------
await p.click('.impeccable-bar .impeccable-variants > button:nth-child(3)');
await p.waitForTimeout(400);
const v3 = await barBox(p);
report.v3 = v3;
if (v3.tabs.length !== 4) problems.push(`v3 tabs ${v3.tabs.length}`);
const divider = await p.evaluate(() =>
  getComputedStyle(document.querySelector('[data-impeccable-variant="3"] ios-tab-bar').shadowRoot.querySelector(".divider")).display
);
report.v3.divider = divider;
if (divider === "none") problems.push("v3 search divider hidden");
await p.screenshot({ path: `${OUT}/v3-search-fa.png` });

// --- variant 4: dock ----------------------------------------------------
await p.click('.impeccable-bar .impeccable-variants > button:nth-child(4)');
await p.waitForTimeout(400);
const v4 = await barBox(p);
report.v4 = v4;
report.v4.labelDisplay = await p.evaluate(() => {
  const nav = document.querySelector('[data-impeccable-variant="4"] ios-tab-bar').shadowRoot.querySelector(".bar");
  return [...nav.querySelectorAll(".tab span")].map((sp) => getComputedStyle(sp).display);
});
if (report.v4.labelDisplay.some((d) => d !== "none"))
  problems.push(`v4 dock labels visible: ${report.v4.labelDisplay}`);
if (v4.tabs.some((t) => t.w < 44 || t.h < 44)) problems.push("v4 sub-44pt targets");
await p.screenshot({ path: `${OUT}/v4-dock-fa.png` });

// minimize on scroll-down (capsule variant only)
await p.click('.impeccable-bar .impeccable-variants > button:nth-child(1)');
await p.waitForTimeout(300);
await p.evaluate(() => window.scrollTo({ top: 600, behavior: "instant" }));
await p.waitForTimeout(400);
report.minimized = await p.evaluate(() => {
  const host = document.querySelector('[data-impeccable-variant="1"] ios-tab-bar');
  return host.hasAttribute("minimized");
});
if (!report.minimized) problems.push("capsule did not minimize on scroll-down");
report.minimizedBox = await p.evaluate(() => {
  const r = document
    .querySelector('[data-impeccable-variant="1"] ios-tab-bar')
    .shadowRoot.querySelector(".bar")
    .getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height) };
});
await p.screenshot({ path: `${OUT}/v1-capsule-minimized-fa.png` });
await p.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
await p.waitForTimeout(400);
report.restored = await p.evaluate(
  () => !document.querySelector('[data-impeccable-variant="1"] ios-tab-bar').hasAttribute("minimized")
);
if (!report.restored) problems.push("capsule did not restore on scroll-up");

// --- contrast (craft floor: >=4.5:1 for 11px labels) --------------------
const CONTRAST_PROBE = () => {
  const parse = (c) => {
    if (c.startsWith("oklab")) {
      const m = c.match(/-?[\d.]+/g).map(Number);
      const [L, a, b] = m;
      const alpha = c.includes("/") ? m[3] : 1;
      const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
      const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
      const s_ = L - 0.0894841775 * a - 1.291485548 * b;
      const l = l_ ** 3, mm = m_ ** 3, ss = s_ ** 3;
      const rgb = [
        4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * ss,
        -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * ss,
        -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * ss,
      ].map((v) => Math.max(0, Math.min(1, v)) * 255);
      return [...rgb, alpha];
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
  const host = document.querySelector('[data-impeccable-variant="1"] ios-tab-bar');
  const nav = host.shadowRoot.querySelector(".bar");
  const page = over(parse(getComputedStyle(document.body).backgroundColor), [255, 255, 255]);
  const glass = over(parse(getComputedStyle(nav).backgroundColor), page);
  const tabs = [...nav.querySelectorAll(".tab")];
  const active = tabs.find((t) => t.getAttribute("aria-current"));
  const inactive = tabs.find((t) => !t.getAttribute("aria-current"));
  return {
    glass: getComputedStyle(nav).backgroundColor,
    active: {
      color: getComputedStyle(active).color,
      ratio: ratio(over(parse(getComputedStyle(active).color), glass), glass),
    },
    inactive: {
      color: getComputedStyle(inactive).color,
      ratio: ratio(over(parse(getComputedStyle(inactive).color), glass), glass),
    },
  };
};
report.contrastLight = await p.evaluate(CONTRAST_PROBE);
if (report.contrastLight.inactive.ratio < 4.5)
  problems.push(`light inactive label contrast ${report.contrastLight.inactive.ratio}`);
if (report.contrastLight.active.ratio < 4.5)
  problems.push(`light active label contrast ${report.contrastLight.active.ratio}`);

// --- en / LTR -----------------------------------------------------------
await p.click("#lang");
await p.waitForTimeout(300);
report.langSwitch = await p.evaluate(() => ({
  dir: document.documentElement.dir,
  lang: document.documentElement.lang,
  labels: [...document.querySelectorAll('[data-impeccable-variant="1"] ios-tab-bar')].flatMap((h) =>
    [...h.shadowRoot.querySelectorAll(".tab")].map((t) => t.textContent.trim())
  ),
  barDir: getComputedStyle(document.querySelector('[data-impeccable-variant="1"] ios-tab-bar')).direction,
}));
if (report.langSwitch.dir !== "ltr") problems.push("lang switch did not flip dir");
if (report.langSwitch.labels.some((l) => !/^[A-Za-z]/.test(l))) problems.push(`labels not switched: ${report.langSwitch.labels}`);
await p.screenshot({ path: `${OUT}/v1-capsule-en.png` });

// --- dark appearance ----------------------------------------------------
await emulate([{ name: "prefers-color-scheme", value: "dark" }]);
await p.click('.impeccable-bar [data-act="reset"]');
await p.waitForTimeout(300);
report.dark = await barBox(p);
report.contrastDark = await p.evaluate(CONTRAST_PROBE);
if (report.contrastDark.inactive.ratio < 4.5)
  problems.push(`dark inactive label contrast ${report.contrastDark.inactive.ratio}`);
if (report.contrastDark.active.ratio < 4.5)
  problems.push(`dark active label contrast ${report.contrastDark.active.ratio}`);
await p.screenshot({ path: `${OUT}/v1-capsule-dark.png` });

// --- reduced transparency / motion -------------------------------------
await emulate([
  { name: "prefers-reduced-motion", value: "reduce" },
  { name: "prefers-reduced-transparency", value: "reduce" },
]);
await p.evaluate(() => window.scrollTo({ top: 600, behavior: "instant" }));
await p.waitForTimeout(300);
report.reducedMotion = await p.evaluate(() => ({
  minimized: document.querySelector('[data-impeccable-variant="1"] ios-tab-bar').hasAttribute("minimized"),
}));
if (report.reducedMotion.minimized) problems.push("minimize ran under prefers-reduced-motion");
await p.screenshot({ path: `${OUT}/v1-reduced.png` });
report.reducedTransparency = await p.evaluate(() => {
  const nav = document.querySelector('[data-impeccable-variant="1"] ios-tab-bar').shadowRoot.querySelector(".bar");
  const cs = getComputedStyle(nav);
  return { bg: cs.backgroundColor, backdrop: cs.backdropFilter };
});

await browser.close();

report.pageErrors = errors;
report.problems = problems;
console.log(JSON.stringify(report, null, 2));
process.exit(problems.length ? 1 : 0);
