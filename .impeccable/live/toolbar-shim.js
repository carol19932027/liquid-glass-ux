/* Impeccable live toolbar — dependency-free shim of the skill's injected
   live chrome (reference/live.md + the real bar markup/CSS carried in
   scripts/live-browser.js) for sandboxes where the engine binary cannot be
   downloaded. Reproduced from the engine's own sources, not invented:

   - global bar: bottom 14px, centered, lacquer-ink surface oklch(4% .004 95),
     8px radius, hairline border oklch(92% 0 0 / .13), shadow
     0 16px 36px -12px oklch(0% 0 0 / .6), 12px system-ui;
   - kinpaku brand mark with the amber agent dot (pulsing = nobody polling,
     which is literally true here: the engine is offline);
   - icon buttons 30px/7px radius, dim oklch(72%) → bright on hover, graphite
     oklch(27%) + gold when active, label slides in on hover;
   - cycle dots for the variants, Tune chip opening the knob drawer that
     slides out of the bar's bar-facing edge (clip-path reveal, same width,
     grid auto-fit minmax(120px,1fr));
   - knobs are custom track+knob spans like the engine's, pointer-driven;
   - page contract unchanged: [data-impeccable-variants] wrapper, original
     slot at rest, data-impeccable-params driving --p-<id>/data-p-<id>.

   The bar also carries this project's fa-RTL / en-LTR switch. */

const STORE = "impeccable-live-selection";
const PREFIX = "impeccable-live";

const C = {
  brand: "oklch(84% 0.19 80.46)",
  brandSoft: "oklch(84% 0.19 80.46 / 0.18)",
  ink: "oklch(4% 0.004 95)",
  border: "oklch(92% 0 0 / 0.13)",
  hairline: "oklch(92% 0 0 / 0.12)",
  text: "oklch(91% 0 0)",
  textDim: "oklch(72% 0 0)",
  toggleActive: "oklch(27% 0 0)",
  amber: "oklch(77% 0.13 82)",
  shadow: "0 16px 36px -12px oklch(0% 0 0 / 0.6)",
};
const FONT = "system-ui, -apple-system, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

const UI = {
  fa: { accept: "پذیرش", tune: "tune", original: "ریل پژوهشی", pick: "انتخاب", lang: "EN" },
  en: { accept: "Accept", tune: "Tune", original: "Original rail", pick: "Pick", lang: "فا" },
};
const uiLang = () => (state.lang || "fa") === "fa" ? "fa" : "en";
const paramLabel = (p) => (uiLang() === "fa" && p.labelFa ? p.labelFa : p.label);

const TAB_ITEMS = {
  fa: [
    { id: "desktop", label: "میزکار", icon: "home" },
    { id: "apps", label: "برنامه‌ها", icon: "grid" },
    { id: "assistant", label: "دستیار", icon: "sparkle" },
  ],
  en: [
    { id: "desktop", label: "Desktop", icon: "home" },
    { id: "apps", label: "Apps", icon: "grid" },
    { id: "assistant", label: "Assistant", icon: "sparkle" },
  ],
};
const SEARCH_ITEM = {
  fa: { id: "search", label: "جستجو", icon: "search" },
  en: { id: "search", label: "Search", icon: "search" },
};

const brandMarkSvg = (color, size = 18) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}" aria-hidden="true">
    <path d="M5 2.5 L13.5 2.5 L5.5 21.5 L5 21.5 Q2.5 21.5 2.5 19 L2.5 5 Q2.5 2.5 5 2.5 Z"/>
    <path d="M16.5 2.5 L19 2.5 Q21.5 2.5 21.5 5 L21.5 19 Q21.5 21.5 19 21.5 L8.5 21.5 Z"/>
  </svg>`;

const ICON = {
  pick: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3"/><circle cx="8" cy="8" r="2.2"/></svg>',
  tune: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 5h7M13 5h1M2 11h1M7 11h7"/><circle cx="11" cy="5" r="2"/><circle cx="5" cy="11" r="2"/></svg>',
  lang: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="8" cy="8" r="6.2"/><path d="M1.8 8h12.4M8 1.8c-3.4 3.6-3.4 8.8 0 12.4 3.4-3.6 3.4-8.8 0-12.4Z"/></svg>',
};

const css = `
#${PREFIX}-bar {
  position: fixed;
  /* the engine parks its bar at bottom:14px; this page's control layer (the
     research rail, or a mounted ios-tab-bar) owns that zone, and the rail
     geometry guard measures it pixel-exact — so the session bar rides above
     whichever control layer is present instead of over it. */
  bottom: 92px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100005;
  transition: bottom 0.35s ${EASE};
  display: flex;
  align-items: stretch;
  width: max-content;
  max-width: calc(100vw - 16px);
  box-sizing: border-box;
  background: ${C.ink};
  border: 1px solid ${C.border};
  border-radius: 8px;
  box-shadow: ${C.shadow};
  font-family: ${FONT};
  font-size: 12px;
  line-height: 1;
  color: ${C.text};
  overflow: hidden;
}
#${PREFIX}-bar * { box-sizing: border-box; }
#${PREFIX}-bar button:focus { outline: none; }
#${PREFIX}-bar button:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px ${C.brandSoft}, 0 0 0 3px ${C.brand};
}
@keyframes ${PREFIX}-agent-dot {
  0%, 100% { opacity: 0.45; transform: scale(0.9); }
  50% { opacity: 1; transform: scale(1); }
}
.${PREFIX}-brand {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: stretch;
  position: relative;
  padding: 0 8px 0 14px;
  color: ${C.brand};
  flex-shrink: 0;
}
.${PREFIX}-brand .dot {
  position: absolute;
  right: -1px;
  bottom: 7px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: ${C.amber};
  box-shadow: 0 0 0 2px ${C.ink};
  /* the engine pulses this dot while nobody polls /poll; here nobody ever
     will, and a perpetual animation would break the rail guard's
     pixel-identical rest-state diff — so the dot stays lit and still. */
  opacity: 0.9;
}
.${PREFIX}-inner {
  display: flex;
  align-items: center;
  padding: 4px 5px 4px 2px;
  gap: 2px;
  flex: 0 0 auto;
}
.${PREFIX}-ibtn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  min-width: 30px;
  padding: 6px 8px;
  border-radius: 7px;
  border: none;
  background: transparent;
  color: ${C.textDim};
  font-family: ${FONT};
  font-size: 11.5px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
  white-space: nowrap;
  overflow: hidden;
}
.${PREFIX}-ibtn:hover { background: ${C.hairline}; color: ${C.text}; }
.${PREFIX}-ibtn[data-active="true"] { background: ${C.toggleActive}; color: ${C.brand}; }
.${PREFIX}-ibtn .lbl {
  display: inline-block;
  max-width: 0;
  opacity: 0;
  overflow: hidden;
  transform: translateX(-4px);
  transition: opacity 0.2s ease, transform 0.25s ${EASE}, max-width 0.25s ${EASE};
}
.${PREFIX}-ibtn:hover .lbl,
.${PREFIX}-ibtn[data-active="true"] .lbl {
  max-width: 120px;
  opacity: 1;
  margin-left: 6px;
  transform: translateX(0);
}
.${PREFIX}-dots {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 8px;
  border-inline: 1px solid ${C.hairline};
  margin-inline: 4px;
  align-self: stretch;
}
.${PREFIX}-dots button {
  width: 9px;
  height: 9px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: oklch(92% 0 0 / 0.25);
  cursor: pointer;
  transition: background 0.15s ease, transform 0.15s ${EASE};
}
.${PREFIX}-dots button:hover { background: oklch(92% 0 0 / 0.45); transform: scale(1.2); }
.${PREFIX}-dots button[aria-pressed="true"] { background: ${C.brand}; }
.${PREFIX}-accept {
  align-self: center;
  margin: 0 6px 0 2px;
  padding: 6px 12px;
  border: none;
  border-radius: 7px;
  background: ${C.brand};
  color: ${C.ink};
  font-family: ${FONT};
  font-size: 11.5px;
  font-weight: 650;
  cursor: pointer;
  transition: filter 0.15s ease;
}
.${PREFIX}-accept:hover { filter: brightness(1.08); }
.${PREFIX}-picked {
  align-self: center;
  max-width: 130px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: ${MONO};
  font-size: 10px;
  letter-spacing: 0.02em;
  color: ${C.textDim};
  padding: 0 6px;
  display: none;
}
#${PREFIX}-params {
  position: fixed;
  z-index: 100004;
  background: ${C.ink};
  color: ${C.text};
  font-family: ${FONT};
  padding: 14px 18px;
  box-sizing: border-box;
  border: 1px solid ${C.border};
  border-bottom: 0;
  border-radius: 10px 10px 0 0;
  box-shadow: ${C.shadow};
  pointer-events: none;
  clip-path: inset(0 0 100% 0);
  transition: clip-path 0.44s ${EASE};
  top: -9999px;
  left: -9999px;
}
#${PREFIX}-params[data-open="true"] { clip-path: inset(0); pointer-events: auto; }
#${PREFIX}-params .grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px 16px;
}
.${PREFIX}-knob { display: grid; gap: 7px; }
.${PREFIX}-knob .head {
  display: flex;
  justify-content: space-between;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: ${C.textDim};
}
.${PREFIX}-knob .head output { font-family: ${MONO}; color: ${C.text}; text-transform: none; }
.${PREFIX}-track {
  position: relative;
  height: 20px;
  border-radius: 999px;
  background: oklch(92% 0 0 / 0.12);
  cursor: pointer;
  touch-action: none;
}
.${PREFIX}-track .fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: 999px;
  background: ${C.brandSoft};
}
.${PREFIX}-track .knob {
  position: absolute;
  top: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: ${C.text};
  box-shadow: 0 1px 3px oklch(0% 0 0 / 0.5);
}
.${PREFIX}-reset {
  margin-top: 12px;
  border: none;
  background: transparent;
  color: ${C.textDim};
  font-family: ${MONO};
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
  padding: 2px 0;
}
.${PREFIX}-reset:hover { color: ${C.text}; }
html.${PREFIX}-pick body * { cursor: crosshair !important; }
`;

const state = { wrapper: null, slots: [], active: 0, params: {}, lang: "fa", tuneOpen: false, pick: false };

const $ = (sel) => document.querySelector(sel);
const readParams = (el) => {
  try {
    return JSON.parse(el.dataset.impeccableParams || "[]");
  } catch {
    return [];
  }
};

function applyParam(variantEl, param, value) {
  if (param.kind === "range") variantEl.style.setProperty(`--p-${param.id}`, value);
  if (param.kind === "toggle") {
    variantEl.style.setProperty(`--p-${param.id}`, value ? 1 : 0);
    variantEl.toggleAttribute("data-p-" + param.id, !!value);
  }
  if (param.kind === "steps") variantEl.setAttribute(`data-p-${param.id}`, value);
}

function persist() {
  const sel = { variant: state.slots[state.active].key, params: state.params, lang: state.lang };
  localStorage.setItem(STORE, JSON.stringify(sel));
  history.replaceState(null, "", `#v=${sel.variant}`);
  window.__impeccableAccept = sel;
}

function applyLocale() {
  const lang = uiLang();
  for (const bar of state.wrapper.querySelectorAll("ios-tab-bar")) {
    const base = TAB_ITEMS[lang];
    bar.setAttribute("dir", lang === "fa" ? "rtl" : "ltr");
    bar.setAttribute("lang", lang);
    bar.items = bar.getAttribute("look") === "search" ? [...base, SEARCH_ITEM[lang]] : base;
  }
  document.dispatchEvent(new CustomEvent("impeccable-locale", { detail: { lang } }));
}

function knobCell(param, slotEl) {
  const saved = state.params[state.slots[state.active].key] || {};
  const value = Number(saved[param.id] ?? param.default);
  const cell = document.createElement("div");
  cell.className = `${PREFIX}-knob`;
  cell.innerHTML =
    `<span class="head"><span>${paramLabel(param)}</span><output></output></span>` +
    `<span class="${PREFIX}-track" role="slider" tabindex="0" aria-label="${paramLabel(param)}"
       aria-valuemin="${param.min}" aria-valuemax="${param.max}" aria-valuenow="${value}">
       <span class="fill"></span><span class="knob"></span>
     </span>`;
  const track = cell.querySelector(".track, ." + PREFIX + "-track");
  const knob = cell.querySelector(".knob");
  const fill = cell.querySelector(".fill");
  const out = cell.querySelector("output");
  const set = (v, commit) => {
    const clamped = Math.min(param.max, Math.max(param.min, v));
    const stepped = Math.round((clamped - param.min) / param.step) * param.step + param.min;
    const pct = ((stepped - param.min) / (param.max - param.min)) * 100;
    knob.style.left = `calc(${pct}% - ${8 + (pct / 100) * 0}px)`;
    knob.style.transform = `translateX(-${pct * 0.16}px)`;
    fill.style.width = pct + "%";
    out.textContent = String(Math.round(stepped * 100) / 100);
    track.setAttribute("aria-valuenow", stepped);
    applyParam(slotEl, param, stepped);
    (state.params[state.slots[state.active].key] ||= {})[param.id] = stepped;
    if (commit) persist();
  };
  const fromEvent = (e) => {
    const r = track.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    set(param.min + pct * (param.max - param.min), true);
  };
  track.addEventListener("pointerdown", (e) => {
    track.setPointerCapture(e.pointerId);
    fromEvent(e);
    const move = (ev) => fromEvent(ev);
    const up = () => {
      track.removeEventListener("pointermove", move);
      track.removeEventListener("pointerup", up);
    };
    track.addEventListener("pointermove", move);
    track.addEventListener("pointerup", up);
  });
  track.addEventListener("keydown", (e) => {
    const cur = Number(track.getAttribute("aria-valuenow"));
    if (e.key === "ArrowRight" || e.key === "ArrowUp") set(cur + param.step, true);
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") set(cur - param.step, true);
    if (e.key === "Home") set(param.min, true);
    if (e.key === "End") set(param.max, true);
  });
  set(value, false);
  return cell;
}

function renderParams() {
  const body = $(`#${PREFIX}-params .grid`);
  body.innerHTML = "";
  const slotEl = state.slots[state.active].el;
  const defs = readParams(slotEl);
  for (const p of defs) if (p.kind === "range" || p.kind === "steps" || p.kind === "toggle") body.append(knobCell(p, slotEl));
  const tune = $(`#${PREFIX}-tune`);
  const n = defs.length;
  tune.title = n ? `Tune this variant (${n} knob${n === 1 ? "" : "s"})` : "No knobs on this variant";
  tune.querySelector(".lbl").textContent = `${UI[uiLang()].tune}${n ? ` · ${n}` : ""}`;
  if (!n && state.tuneOpen) toggleTune(false);
}

function positionParams() {
  const panel = $(`#${PREFIX}-params`);
  const bar = $(`#${PREFIX}-bar`);
  const r = bar.getBoundingClientRect();
  panel.style.width = Math.max(r.width, 260) + "px";
  panel.style.left = Math.max(8, Math.min(innerWidth - panel.offsetWidth - 8, r.left + r.width / 2 - Math.max(r.width, 260) / 2)) + "px";
  panel.style.top = r.top - panel.offsetHeight + 1 + "px";
}

function toggleTune(open) {
  state.tuneOpen = open ?? !state.tuneOpen;
  const panel = $(`#${PREFIX}-params`);
  const tune = $(`#${PREFIX}-tune`);
  tune.dataset.active = String(state.tuneOpen);
  if (state.tuneOpen) {
    renderParams();
    panel.dataset.open = "true";
    const settle = () => {
      positionParams();
      panel.style.top = $(`#${PREFIX}-bar`).getBoundingClientRect().top - panel.offsetHeight + 1 + "px";
    };
    requestAnimationFrame(settle);
    setTimeout(settle, 320); // the bar grows while the active toggle's label slides in
  } else {
    panel.dataset.open = "false";
  }
}

function setVariant(i, silent) {
  state.active = i;
  state.slots.forEach((slot, n) => {
    slot.el.style.display = n === i ? (slot.key === "original" ? "" : "contents") : "none";
  });
  if (state.tuneOpen) setTimeout(positionParams, 360);
  document.querySelectorAll(`#${PREFIX}-dots button`).forEach((b, n) =>
    b.setAttribute("aria-pressed", String(n === i))
  );
  if (state.tuneOpen) renderParams();
  if (!silent) persist();
}

function refreshLabels() {
  const t = UI[uiLang()];
  const dots = document.querySelectorAll(`#${PREFIX}-dots button`);
  dots.forEach((b, i) => {
    const slot = state.slots[i];
    if (slot.key !== "original") {
      const localized = slot.el.dataset[uiLang()];
      if (localized) slot.el.dataset.impeccableVariantLabel = localized;
    }
    b.title = slot.key === "original" ? t.original : slot.el.dataset.impeccableVariantLabel || `V${i}`;
    b.setAttribute("aria-label", b.title);
  });
  $(`#${PREFIX}-pick .lbl`).textContent = t.pick;
  $(`#${PREFIX}-lang .lbl`).textContent = t.lang;
  $(`#${PREFIX}-accept`).textContent = t.accept;
  if (state.tuneOpen) renderParams();
}

export function mountToolbar() {
  const wrapper = document.querySelector("[data-impeccable-variants]");
  if (!wrapper) return null;
  state.wrapper = wrapper;
  state.slots = Array.from(wrapper.querySelectorAll(":scope > [data-impeccable-variant]")).map(
    (el) => ({ el, key: el.dataset.impeccableVariant })
  );

  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);

  const bar = document.createElement("div");
  bar.id = `${PREFIX}-bar`;
  bar.innerHTML =
    `<span class="${PREFIX}-brand" role="img" aria-label="Impeccable live mode - agent not polling">
       <span class="mark">${brandMarkSvg(C.brand, 18)}</span><span class="dot" aria-hidden="true"></span>
     </span>
     <span class="${PREFIX}-inner">
       <button type="button" class="${PREFIX}-ibtn" id="${PREFIX}-pick" data-active="false" aria-label="Pick">${ICON.pick}<span class="lbl"></span></button>
       <button type="button" class="${PREFIX}-ibtn" id="${PREFIX}-lang" aria-label="Language">${ICON.lang}<span class="lbl"></span></button>
       <span class="${PREFIX}-picked" id="${PREFIX}-picked"></span>
       <span class="${PREFIX}-dots" role="group" aria-label="Variants"></span>
       <button type="button" class="${PREFIX}-ibtn" id="${PREFIX}-tune" data-active="false" aria-label="Tune">${ICON.tune}<span class="lbl"></span></button>
       <button type="button" class="${PREFIX}-accept" id="${PREFIX}-accept"></button>
     </span>`;
  document.body.append(bar);

  const panel = document.createElement("div");
  panel.id = `${PREFIX}-params`;
  panel.innerHTML = `<div class="grid"></div><button type="button" class="${PREFIX}-reset">reset tune</button>`;
  document.body.append(panel);

  const dots = bar.querySelector(`.${PREFIX}-dots`);
  state.slots.forEach((slot, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.addEventListener("click", () => setVariant(i));
    dots.append(b);
  });

  $(`#${PREFIX}-pick`).addEventListener("click", () => {
    state.pick = !state.pick;
    $(`#${PREFIX}-pick`).dataset.active = String(state.pick);
    document.documentElement.classList.toggle(`${PREFIX}-pick`, state.pick);
  });
  document.addEventListener(
    "click",
    (e) => {
      if (!state.pick) return;
      if (e.target.closest(`#${PREFIX}-bar, #${PREFIX}-params`)) return;
      e.preventDefault();
      e.stopPropagation();
      const t = e.target;
      const name =
        t.tagName.toLowerCase() + (t.className ? "." + String(t.className).trim().split(/\s+/).slice(0, 2).join(".") : "");
      const chip = $(`#${PREFIX}-picked`);
      chip.style.display = "block";
      chip.textContent = name;
    },
    true
  );
  $(`#${PREFIX}-lang`).addEventListener("click", () => {
    state.lang = uiLang() === "fa" ? "en" : "fa";
    refreshLabels();
    applyLocale();
    persist();
  });
  $(`#${PREFIX}-tune`).addEventListener("click", () => toggleTune());
  $(`#${PREFIX}-params .${PREFIX}-reset`).addEventListener("click", () => {
    delete state.params[state.slots[state.active].key];
    const el = state.slots[state.active].el;
    for (const p of readParams(el)) {
      el.style.removeProperty(`--p-${p.id}`);
      el.removeAttribute(`data-p-${p.id}`);
    }
    renderParams();
    persist();
  });
  $(`#${PREFIX}-accept`).addEventListener("click", () => {
    persist();
    document.dispatchEvent(new CustomEvent("impeccable-accept", { detail: window.__impeccableAccept }));
  });
  window.addEventListener("resize", () => state.tuneOpen && positionParams());
  document.addEventListener("impeccable-locale", refreshLabels);

  let start = 0;
  const saved = JSON.parse(localStorage.getItem(STORE) || "null");
  const hash = (location.hash.match(/#v=([\w-]+)/) || [])[1];
  const pickKey = hash || saved?.variant;
  if (pickKey) {
    const i = state.slots.findIndex((s) => s.key === pickKey);
    if (i >= 0) start = i;
  }
  if (saved?.params) state.params = saved.params;
  if (saved?.lang) state.lang = saved.lang;
  refreshLabels();
  applyLocale();
  setVariant(start, true);
  return bar;
}

if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", mountToolbar);
else mountToolbar();
