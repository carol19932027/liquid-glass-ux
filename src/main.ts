import { createLiquidGlass, supportsRefraction } from "./glass/liquid-glass";

const glass = document.querySelector<HTMLElement>(".glass")!;
const title = document.querySelector<HTMLElement>("h1")!;

// Size the glass to the headline's ink, not its line box: descenders and the
// tight letter-spacing reach past the box. The width is just enough that the
// round ends of a pill 8% taller than the ink cover its corners; the glass
// itself is taller still. The headline is shifted so its ink is centred
// horizontally and the "G" exactly vertically under the glass.
const ctx = document.createElement("canvas").getContext("2d")!;
const probe = document.createElement("span");
probe.style.cssText = "display: inline-block; width: 0; height: 0";
const fit = () => {
  const cs = getComputedStyle(title);
  ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  ctx.letterSpacing = cs.letterSpacing;
  const m = ctx.measureText(title.textContent ?? "");
  const g = ctx.measureText("G");
  const box = title.getBoundingClientRect();
  // Baseline from layout, not from the font metrics: Chrome rounds the line
  // box, so the computed one can be off by most of a pixel.
  title.append(probe);
  const baseline = probe.getBoundingClientRect().top - box.top;
  probe.remove();
  const ink = {
    left: -m.actualBoundingBoxLeft,
    right: m.actualBoundingBoxRight,
    top: baseline - m.actualBoundingBoxAscent,
    bottom: baseline + m.actualBoundingBoxDescent,
  };
  const gMid = baseline + (g.actualBoundingBoxDescent - g.actualBoundingBoxAscent) / 2;
  const iw = ink.right - ink.left;
  const ih = ink.bottom - ink.top;
  const fitH = ih * 1.08;
  const w = iw + fitH - 2 * Math.sqrt((fitH / 2) ** 2 - (ih / 2) ** 2);
  // Centred on the G, the ink reaches further down (descenders) than up.
  const h = Math.max(ih * 1.2, 2 * Math.max(gMid - ink.top, ink.bottom - gMid) * 1.06);

  title.style.translate = `${box.width / 2 - (ink.left + ink.right) / 2}px ${box.height / 2 - gMid}px`;
  const root = document.documentElement.style;
  root.setProperty("--glass-w", `${w}px`);
  root.setProperty("--glass-h", `${h}px`);
  // Scales shadow and edge widths (1 = a 60px pill).
  glass.style.setProperty("--lg-s", String(h / 60));
  fitCopies();
  // Measure the fixed spot again; park() puts it back if needed.
  parked = false;
  document.documentElement.classList.remove("parked");
  if (scrollCopy) parkScroll();
  else park();
  rangeCopies();
  shade();
};

// Switch to the dark tuning when the black section's top edge reaches the
// middle of the glass. The glass itself switches in one step: changing it on
// every frame repaints it on every frame, and that flickers in Chromium on a
// real display. Only the veil and the edge light fade, as two finished
// covers crossfaded by opacity (addCover below): the compositor blends them
// without repainting anything.
const dark = document.querySelector<HTMLElement>(".dark")!;
let stateNow = "";
const shade = () => {
  const box = glass.getBoundingClientRect();
  const edge = dark.getBoundingClientRect().top - box.top;
  const isDark = edge < box.height / 2;
  // The caustic glows just below the glass, so it has to be gone before the
  // edge reaches the glass, or it lies on the black as a grey haze.
  const caustic = edge > box.height + 30;
  const state = `${isDark}:${caustic}`;
  if (state === stateNow) return;
  stateNow = state;
  glass.toggleAttribute("data-lg-dark", isDark);
  tones[0]!.style.opacity = isDark ? "0.001" : "1";
  tones[1]!.style.opacity = isDark ? "1" : "0.001";
  glass.style.setProperty("--lg-caustic-o", caustic ? "0.7" : "0");
  document.documentElement.classList.toggle("end-dark", isDark);
};
// Scroll events fire faster than frames, and all three readers only need
// the newest position once per frame: coalesce them into a single rAF
// callback instead of measuring three times per event.
let scrollReq = 0;
addEventListener("scroll", () => {
  if (scrollReq) return;
  scrollReq = requestAnimationFrame(() => {
    scrollReq = 0;
    park();
    shade();
    showCopy();
  });
}, { passive: true });

// Each statement's title is read inside the glass: a copy of it in a layer
// over the glass, shown while the glass is over that section. Copies swap by opacity on their own layers, like the
// tones, so a swap repaints nothing. The page keeps the original text for
// screen readers and search, visually hidden. Statements below the point
// where the glass parks stay on the page as they are.
const stop = document.querySelectorAll<HTMLElement>(".dark .pair")[0]!;
const statements = [...document.querySelectorAll<HTMLElement>(".statement")].filter(
  (st) => st.compareDocumentPosition(stop) & Node.DOCUMENT_POSITION_FOLLOWING,
);
const copyLayer = document.createElement("div");
copyLayer.className = "glass-text";
copyLayer.setAttribute("aria-hidden", "true");
const copies = statements.map((st) => {
  st.classList.add("in-glass");
  const copy = document.createElement("div");
  copy.className = "glass-copy";
  copy.classList.toggle("on-dark", !!st.closest(".dark"));
  copy.append(st.querySelector("h2")!.cloneNode(true));
  copy.style.opacity = "0.001";
  copyLayer.append(copy);
  return copy;
});
/** Shrinks each title until it fits the glass. */
const fitCopies = () => {
  for (const copy of copies) {
    const h2 = copy.querySelector("h2")!;
    let k = 1;
    copy.style.setProperty("--fit", "1");
    while (k > 0.5 && (h2.offsetHeight > copy.clientHeight || h2.scrollWidth > h2.clientWidth)) {
      k -= 0.04;
      copy.style.setProperty("--fit", String(k));
    }
  }
};
// Tied to the scroll position, not triggered by it. A title is half faded
// where the section's empty space covers the glass but for a strip at the
// top and bottom (COPY_EDGE of its height); the fade spans COPY_FADE of the
// glass height around that point. While it fades it slides by up to
// COPY_SHIFT of the glass height, towards where its section is, so it comes
// up from below and leaves upwards while scrolling down, and the other way
// round; while fully there it rests in the middle. Opacity and transform on
// the copy's own layer only, so nothing is repainted.
const COPY_EDGE = 0.15;
const COPY_SHIFT = 0.4;
const COPY_FADE = 0.5;
// Where scroll-driven animations exist, the compositor runs the same curve
// (demo.css); here only the scroll positions of each fade are worked out.
const scrollCopy = CSS.supports("animation-timeline: scroll()");
if (scrollCopy) {
  document.documentElement.classList.add("scroll-copy");
  for (const copy of copies) copy.style.removeProperty("opacity");
}
const copyKeys = document.createElement("style");
document.head.append(copyKeys);
const rangeCopies = () => {
  if (!scrollCopy || parked) return;
  const gh = glass.offsetHeight;
  const top = fixedMid - gh / 2;
  const edge = gh * COPY_EDGE;
  const fade = gh * COPY_FADE;
  const max = Math.max(1, document.documentElement.scrollHeight - document.documentElement.clientHeight);
  const at = (y: number) => `${Math.min(100, Math.max(0, (y / max) * 100)).toFixed(4)}%`;
  const shift = `${(gh * COPY_SHIFT).toFixed(1)}px`;
  // The script version's curve, seen from either side: a quadratic ease-out
  // coming in, its mirror going out.
  const css = statements
    .map((st, k) => {
      const r = st.getBoundingClientRect();
      // Scroll positions where the script version's t is 0 and 1.
      const inStart = r.top + scrollY - top - edge - fade / 2;
      const outStart = r.bottom + scrollY - (top + gh) + edge - fade / 2;
      const hidden = (y: string) => `opacity: 0.001; translate: 0 ${y}`;
      return (
        `@keyframes copy-${k} {` +
        `0%, ${at(inStart)} { ${hidden(shift)}; animation-timing-function: cubic-bezier(0.333, 0.667, 0.667, 1) }` +
        `${at(inStart + fade)}, ${at(outStart)} { opacity: 1; translate: 0 0; animation-timing-function: cubic-bezier(0.333, 0, 0.667, 0.333) }` +
        `${at(outStart + fade)}, 100% { ${hidden(`-${shift}`)} } }` +
        `.scroll-copy .glass-copy:nth-child(${k + 1}) { animation-name: copy-${k} }`
      );
    })
    .join("\n");
  // Only on a real change: new keyframes restart the animations.
  if (copyKeys.textContent !== css) copyKeys.textContent = css;
};
const showCopy = () => {
  if (scrollCopy) return;
  const box = glass.getBoundingClientRect();
  const edge = box.height * COPY_EDGE;
  const mid = box.top + box.height / 2;
  statements.forEach((st, k) => {
    const r = st.getBoundingClientRect();
    const inside = Math.min(box.top + edge - r.top, r.bottom - (box.bottom - edge));
    const t = Math.min(1, Math.max(0, 0.5 + inside / (box.height * COPY_FADE)));
    // Close to linear, but it lands softly in the middle (quadratic ease-out).
    const e = 1 - (1 - t) * (1 - t);
    const o = Math.max(0.001, e);
    const y = (1 - e) * box.height * COPY_SHIFT * Math.sign((r.top + r.bottom) / 2 - mid);
    const copy = copies[k]!;
    copy.style.opacity = o.toFixed(3);
    copy.style.transform = o > 0.001 ? `translateY(${y.toFixed(1)}px)` : "";
  });
};

// Once the middle of the glass reaches the bottom of the dark pictures, the
// glass parks there and scrolls away with the page. The switch from fixed to
// absolute happens at the same spot on screen, so nothing jumps.
let fixedMid = 0;
let parked = false;
// Where scroll-driven animations exist, the compositor does it: the glass
// stays fixed and, from the parking point on, is moved up exactly as far as
// the page scrolls. The script version switches on a scroll event, and under
// load that comes frames late: the glass overshoots and jumps back.
const parkKeys = document.createElement("style");
document.head.append(parkKeys);
const parkScroll = () => {
  fixedMid = glass.offsetTop + glass.offsetHeight / 2;
  const from = stop.getBoundingClientRect().bottom + scrollY - fixedMid;
  const max = Math.max(1, document.documentElement.scrollHeight - document.documentElement.clientHeight);
  const at = Math.min(100, Math.max(0, (from / max) * 100));
  // Covers the browser keeps on the glass follow its translate by themselves;
  // given the same one as well, they would move twice as far.
  const riders = lg.coversFollowHost ? ".glass, .glass-text, .lg-tick" : ".glass, .glass-text, .glass-tone, .lg-tick";
  const css =
    `@keyframes park { 0%, ${at.toFixed(5)}% { translate: 0 0 } 100% { translate: 0 ${(-Math.max(0, max - from)).toFixed(2)}px } }` +
    `.scroll-copy :is(${riders}) { animation: park linear both; animation-timeline: scroll(root) }`;
  if (parkKeys.textContent !== css) parkKeys.textContent = css;
};
const park = () => {
  if (scrollCopy) return;
  if (!parked) {
    const box = glass.getBoundingClientRect();
    fixedMid = box.top + box.height / 2;
  }
  const stopY = stop.getBoundingClientRect().bottom;
  const shouldPark = stopY < fixedMid;
  if (shouldPark === parked) return;
  parked = shouldPark;
  const top = stopY + scrollY - glass.offsetHeight / 2;
  document.documentElement.style.setProperty("--park-top", `${top}px`);
  document.documentElement.classList.toggle("parked", parked);
  lg.update();
};

// A radius larger than the box is clamped to half the short side: a pill.
// The glass puts <main> into a compositor layer of its own (promote,
// default): without that, Chromium does not raster the page in time
// during a fast fling and shows it cut off below the glass.
const lg = createLiquidGlass(glass, { radius: 9999, rim: 1.1 });
// Never quite 0: a layer at opacity 0 may not be rasterised, and would then
// flash on the first frame of the fade.
const tones = [0, 1].map((tuning) => {
  const tone = lg.addCover(document.body, tuning);
  tone.classList.add("glass-tone");
  tone.style.opacity = "0.001";
  return tone;
});
document.body.append(copyLayer);
fit();
park();
showCopy();
new ResizeObserver(fit).observe(title);
// Images and fonts arriving later move the sections.
new ResizeObserver(() => {
  if (scrollCopy) parkScroll();
  rangeCopies();
}).observe(document.body);
addEventListener("resize", fit);

// The gradient under the glass is decoration, not information: anyone who has
// asked the operating system to calm motion down gets the still poster instead
// of the loop. CSS cannot stop an autoplaying <video>, so the attribute comes
// off here, before the media is fetched, and the preference is re-read whenever
// it changes rather than only on load.
const video = document.querySelector("video")!;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const syncReducedMotion = () => {
  if (!reducedMotion.matches) return;
  video.removeAttribute("autoplay");
  video.pause();
};
syncReducedMotion();
reducedMotion.addEventListener("change", syncReducedMotion);

// The reflection reads up to 160px around the glass, but Chromium only
// redraws it for changes under the glass itself. While the video plays near
// it, refresh once per video frame so it does not freeze in the reflection.
// requestVideoFrameCallback ships in Chromium and Safari but not in
// Firefox, where an unguarded call throws a TypeError and kills the rest
// of this script. Without it the reflection simply refreshes on scroll
// and resize ticks instead of per video frame.
const onVideoFrame = () => {
  const v = video.getBoundingClientRect();
  const g = glass.getBoundingClientRect();
  if (v.bottom > g.top - 160 && v.top < g.bottom + 160) lg.refresh();
  if ("requestVideoFrameCallback" in video) video.requestVideoFrameCallback(onVideoFrame);
};
if ("requestVideoFrameCallback" in video) video.requestVideoFrameCallback(onVideoFrame);

// Browsers that cannot run the refraction get frosted glass; say so, and
// where to see the real thing. On iPhone and iPad every browser is Safari
// underneath, so switching browsers does not help there.
if (!supportsRefraction) {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  let dismissed = false;
  try {
    dismissed = sessionStorage.getItem("lg-notice") === "closed";
  } catch {}
  if (!dismissed) {
    const notice = document.createElement("aside");
    notice.className = "notice";
    notice.setAttribute("role", "status");
    notice.innerHTML = `
      <p><strong>You are seeing the fallback.</strong> ${
        ios
          ? "On iPhone and iPad every browser runs on Safari's engine, which cannot do the refraction yet. Open this page in Chrome or Edge on a computer or an Android phone."
          : "Your browser cannot display the full effect yet, so the glass is only frosted. Open this page in Chrome, Edge, Arc, Brave or Opera to see it work."
      }</p>
      <button type="button" aria-label="Close">&times;</button>`;
    notice.querySelector("button")!.addEventListener("click", () => {
      notice.remove();
      try {
        sessionStorage.setItem("lg-notice", "closed");
      } catch {}
    });
    document.body.append(notice);
  }
}

// --- The morph rail ---------------------------------------------------------
// Two glass hosts, one data-state. The switch is the only writer: it flips
// the rail between the labelled pill and the split notification-button-
// plus-tab-bar, and everything else is the CSS transition set in demo.css.
// The pill's own href follows the state: in-page while it labels the
// sections, back to the top once it has become the bell button.
const rail = document.querySelector<HTMLElement>(".rail")!;
const railTabsHost = document.querySelector<HTMLElement>(".rail-tabs")!;
const railMorph = document.querySelector<HTMLAnchorElement>(".rail-morph")!;
const railSwitch = document.querySelector<HTMLInputElement>("#morph-switch")!;

for (const host of document.querySelectorAll<HTMLElement>(".rail-host")) {
  // reflect: false — the reflection layer overhangs its host by `pad` on
  // every side, and the two rail hosts sit 10px apart, so their overhangs
  // would overlap: two backdrop roots filtering each other's pixels,
  // invalidating one another every frame, which blinks the glass out to
  // near-transparent in the compact state, in any position, still or
  // scrolling. Without the reflection layer the hosts cannot touch.
  createLiquidGlass(host, { radius: 28, reflect: false });
}

const RAIL_STATES = {
  label: { href: "#accurate", label: "Browse the sections" },
  compact: { href: "#top", label: "Notifications" },
} as const;

const setRailState = (compact: boolean) => {
  rail.dataset.state = compact ? "compact" : "label";
  const state = compact ? RAIL_STATES.compact : RAIL_STATES.label;
  railMorph.href = state.href;
  railMorph.setAttribute("aria-label", state.label);
};

// The tab bar: three tabs in an RTL island, the selected one wears the ink
// pill. Selection moves with click and arrow keys (in RTL, ArrowLeft is
// "forward"), roving tabindex per the tabs pattern; this demo has no tab
// panels, so the state is purely the rail's own.
const railTabs = Array.from(document.querySelectorAll<HTMLButtonElement>(".rail-tab"));

const selectTab = (tab: HTMLButtonElement) => {
  for (const other of railTabs) {
    const on = other === tab;
    other.setAttribute("aria-selected", String(on));
    other.tabIndex = on ? 0 : -1;
  }
};

for (const [i, tab] of railTabs.entries()) {
  tab.addEventListener("click", () => selectTab(tab));
  tab.addEventListener("keydown", (event) => {
    const last = railTabs.length - 1;
    const to =
      event.key === "ArrowLeft" ? Math.min(i + 1, last)
      : event.key === "ArrowRight" ? Math.max(i - 1, 0)
      : event.key === "Home" ? 0
      : event.key === "End" ? last
      : -1;
    if (to < 0) return;
    event.preventDefault();
    selectTab(railTabs[to]!);
    railTabs[to]!.focus();
  });
}

railSwitch.addEventListener("change", () => {
  // rail-armed enables the reference's anticipation nudge (a keyed
  // animation on the morph host, translate out to 25px/20px at 28% of a
  // .62s run and a pop-spring return). It is armed on the first switch
  // flip only, so the rail never nudges on load, when the state is
  // written once to match the switch's initial position.
  rail.classList.add("rail-armed");
  setRailState(railSwitch.checked);
  startNeck();
});
setRailState(railSwitch.checked);

// --- The liquid neck ---------------------------------------------------------
// A gooey bridge between the bell's right cap and the tab pill's left cap
// (see docs/gooey-morph-research.md). It is a sibling of the hosts, never
// an ancestor, clipped to a catenoid path and carrying its own backdrop-
// filter — a backdrop root that contains no glass, which is the only place
// a filter may live this close to the rail. The path is rewritten per frame
// from the LIVE cap rects while the morph runs, so it stays in phase with
// the width spring, the 24px rise and the nudge without a parallel clock:
// the waist thins as the caps separate (metaball falloff) and pinches off
// exactly at the 10px resting gap, so both resting states stay neckless
// and pixel-identical. On the merge it swells back until the caps meet.
const railNeck = document.querySelector<HTMLElement>(".rail-neck")!;
const NECK_SEP = 10; // cap gap (+ half the rise) that eats the waist whole
const NECK_LIFE = 1200; // ms a neck run may live after a flip
const NECK_FADE = 140; // ms melt-away fade once the geometry says hide
let neckReq = 0;
let neckUntil = 0;
let neckHideStart = 0;
let neckMode: "live" | "fade" | "off" = "off";
let neckStill = 0;
let neckLastGap = NaN;
let neckLastRise = NaN;

const neckFrame = (now: number) => {
  neckReq = 0;
  let fading = false;
  const rr = rail.getBoundingClientRect();
  const mr = railMorph.getBoundingClientRect();
  const tr = railTabsHost.getBoundingClientRect();
  const gap = tr.left - mr.right; // <0 while the caps still overlap
  const rise = tr.top - rr.top; // 0 in the slot, ~24 parked below
  const tl = tr.left - rr.left;
  const trght = tr.right - rr.left;
  const seamX = mr.right - rr.left; // morph's right cap, rail space
  const tabVis = getComputedStyle(railTabsHost).visibility === "visible";
  // Regime 1 — metaball bridge: the caps are apart (or nearly), the waist
  // thins with the gap and pinches off exactly at the 10px resting gap.
  // Metaball falloff: the waist swells to full height (48px) as the caps
  // meet and pinches to zero exactly at the 10px resting gap — the neck
  // lives only inside the motion; both resting states stay neckless.
  const sep = gap + 0.5 * rise;
  const wBridge = 48 * Math.pow(Math.min(1, Math.max(0, 1 - sep / NECK_SEP)), 1.35);
  const bridge = tabVis && wBridge > 0.75 && gap + 52 > 1;
  // Regime 2 — wet seam: the caps overlap, so the junction is the vertical
  // seam where the morph's right cap sweeps across the tab pill. The neck
  // straddles that seam at full height — the fused liquid body — from the
  // fusion snap until the morph has swallowed the pill (or it parks).
  const straddle =
    tabVis && gap < 0 && rise > 1.5 && seamX > tl + 2 && seamX < trght - 16;
  // Visibility is pure geometry: at rest the waist is zero, so both
  // resting states stay neckless and the loop parks itself.
  const show = bridge || straddle;
  // Rest detection: ~20 identical cap reads mean the morph has settled, so
  // the loop can stop — the last drawn neck stays as a persisted style.
  const settled = Math.abs(gap - neckLastGap) < 0.5 && Math.abs(rise - neckLastRise) < 0.5;
  neckStill = settled ? neckStill + 1 : 0;
  neckLastGap = gap;
  neckLastRise = rise;
  if (show) {
    // 26px tuck: the concave fillets flare wide under the caps, like the
    // reference's deep pinch, and the seams stay hidden under their glass.
    const x1 = +((straddle ? seamX : mr.right - rr.left) - 26).toFixed(1);
    const x2 = +((straddle ? seamX : tr.left - rr.left) + 26).toFixed(1);
    // Viewport-space caps as written, so the verify rig can check the tuck
    // against the exact rects this frame used (its own read lags by one).
    const x1v = +(mr.right - 26).toFixed(1);
    const x2v = +((straddle ? mr.right : tr.left) + 26).toFixed(1);
    const w = straddle ? 48 : wBridge;
    const yLt = 6;
    const yLb = 50;
    const yRt = +(rise + 6).toFixed(1);
    const yRb = +(rise + 50).toFixed(1);
    const mx = (x1 + x2) / 2;
    const yc = 28 + rise / 2;
    const yT = +(yc - w / 2).toFixed(1);
    const yB = +(yc + w / 2).toFixed(1);
    const q = (n: number) => +n.toFixed(1);
    const d =
      `M ${x1} ${yLt} C ${q(x1 + (mx - x1) / 2)} ${yLt}, ${q(mx)} ${q(yLt + (yT - yLt) / 2)}, ${q(mx)} ${yT} ` +
      `C ${q(mx)} ${q(yRt + (yT - yRt) / 2)}, ${q(x2 - (x2 - mx) / 2)} ${yRt}, ${x2} ${yRt} ` +
      `L ${x2} ${yRb} C ${q(x2 - (x2 - mx) / 2)} ${yRb}, ${q(mx)} ${q(yRb + (yB - yRb) / 2)}, ${q(mx)} ${yB} ` +
      `C ${q(mx)} ${q(yLb + (yB - yLb) / 2)}, ${q(x1 + (mx - x1) / 2)} ${yLb}, ${x1} ${yLb} Z`;
    railNeck.style.clipPath = `path("${d}")`;
    railNeck.style.visibility = "visible";
    railNeck.style.opacity = "1";
    railNeck.dataset.phase = "live";
    neckMode = "live";
    railNeck.dataset.span = [x1v, x2v, mr.right.toFixed(1), tr.left.toFixed(1)].join(",");
  } else {
    // Melt-away: hold the last path and fade it out, so the thread is seen
    // dissolving into the caps instead of blinking out in one frame. Only
    // a neck that was live this run fades — a fresh run starting from a
    // neckless state must not resurrect the previous run's path.
    if (neckMode === "live") {
      neckMode = "fade";
      neckHideStart = now;
    }
    if (neckMode === "fade") {
      const k = (now - neckHideStart) / NECK_FADE;
      if (k < 1 && railNeck.style.clipPath) {
        railNeck.style.opacity = (1 - k).toFixed(2);
        railNeck.style.visibility = "visible";
        railNeck.dataset.phase = "fade";
        fading = true;
      } else {
        railNeck.style.visibility = "hidden";
        railNeck.style.opacity = "1";
        railNeck.dataset.phase = "";
        neckMode = "off";
      }
    } else {
      railNeck.style.visibility = "hidden";
      railNeck.style.opacity = "1";
      railNeck.dataset.phase = "";
    }
  }
  if (show || fading || frozenCheck() || (now < neckUntil && neckStill < 20))
    neckReq = requestAnimationFrame(neckFrame);
};

// The verification rig freezes animations; a frozen morph must keep its
// neck instead of letting the run expire mid-capture.
const frozenCheck = () =>
  document
    .getAnimations()
    .some((a) => a.playState === "paused" && a.timeline === document.timeline);

const startNeck = () => {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  // clip-path: path() is the neck's only paint; without it the element
  // would show as a full-rail fog rectangle — stay neckless instead.
  if (!CSS.supports("clip-path", 'path("M 0 0 L 1 0 L 1 1 Z")')) return;
  neckUntil = performance.now() + NECK_LIFE;
  neckStill = 0;
  neckLastGap = NaN;
  neckLastRise = NaN;
  if (!neckReq) neckReq = requestAnimationFrame(neckFrame);
};
