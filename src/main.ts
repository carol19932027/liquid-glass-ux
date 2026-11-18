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
// Two glass hosts, one data-state, driven by the notification count the
// switch simulates: alert (badge > 0) is the bell button plus the tab
// pill; calm (zero mail) keeps the navigation in its own shape and melts
// ONLY the bell away, into the tab pill's left cap. The switch is the
// only writer. The bell's own href/focusability follow the state: a live
// Notifications link in alert, unfocusable and aria-hidden in calm, where
// there is no button left to tab to.
const NOTIFICATIONS = 3; // what the switch's "on" simulates as arrived
const rail = document.querySelector<HTMLElement>(".rail")!;
const railTabsHost = document.querySelector<HTMLElement>(".rail-tabs")!;
const railMorph = document.querySelector<HTMLAnchorElement>(".rail-morph")!;
const railSwitch = document.querySelector<HTMLInputElement>("#morph-switch")!;

for (const host of document.querySelectorAll<HTMLElement>(".rail-host")) {
  // reflect: false — the reflection layer overhangs its host by `pad` on
  // every side; two overhanging backdrop roots filtering each other's
  // pixels invalidate one another every frame and blink the glass out
  // to near-transparent. Without it the hosts MAY overlap (they do, mid
  // morph): the stack is one-way — bell z2 over pill z0 — so only the
  // bell ever samples the other's glass, and that stacked sampling is
  // exactly the fusion effect.
  createLiquidGlass(host, { radius: 28, reflect: false });
}

const railBadge = document.querySelector<HTMLElement>(".rail-badge")!;

const setRailState = (alert: boolean) => {
  rail.dataset.state = alert ? "alert" : "calm";
  railBadge.textContent = String(NOTIFICATIONS);
  if (alert) {
    railMorph.href = "#top";
    railMorph.removeAttribute("tabindex");
    railMorph.removeAttribute("aria-hidden");
    railMorph.setAttribute("aria-label", `Notifications, ${NOTIFICATIONS} unread`);
  } else {
    // no mail, no button: the bell is melted away, so it must not stay in
    // the tab order or the accessibility tree
    railMorph.removeAttribute("href");
    railMorph.tabIndex = -1;
    railMorph.setAttribute("aria-hidden", "true");
    railMorph.setAttribute("aria-label", "Notifications");
  }
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
});
setRailState(railSwitch.checked);
