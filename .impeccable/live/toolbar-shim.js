/* Impeccable live toolbar — dependency-free shim of the skill's live bar
   (reference/live.md) for environments where the engine binary cannot be
   installed (this sandbox: release download blocked). It speaks the skill's
   exact page contract:

   - `[data-impeccable-variants]` wrapper with a `data-impeccable-variant="original"`
     slot plus `data-impeccable-variant="1..N"` children;
   - at rest the ORIGINAL slot is what shows, so the committed page is
     byte-for-byte the pre-session design until a variant is picked;
   - `data-impeccable-params` knobs (range/steps/toggle) docked one control
     per parameter in the bar, driving `--p-<id>` / `data-p-<id>` on the
     variant root;
   - selection + tune persist (localStorage, mirrored in the URL hash) so a
     reload or a headless pass reopens the same state; Accept records the
     session values and fires `impeccable-accept` (the engine's carbonize
     step is a source edit and stays a manual/agent step).

   The bar also carries this project's fa-RTL / en-LTR switch: it rewrites
   each mounted <ios-tab-bar>'s items + dir and re-labels the bar itself. */

const STORE = "impeccable-live-selection";

const UI = {
  fa: {
    accept: "پذیرش",
    reset: "بازنشانی tune",
    original: "ریل پژوهشی",
    bar: "نوار ابزار زندهٔ impeccable",
    lang: "EN",
  },
  en: {
    accept: "Accept",
    reset: "Reset tune",
    original: "Original rail",
    bar: "Impeccable live toolbar",
    lang: "فا",
  },
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

const css = `
.impeccable-bar {
  position: fixed;
  inset-inline-end: 14px;
  bottom: calc(92px + env(safe-area-inset-bottom, 0px));
  z-index: 90;
  display: grid;
  gap: 8px;
  max-width: min(320px, calc(100vw - 28px));
  padding: 10px 12px;
  border-radius: 18px;
  background: var(--ios-glass-tint-regular, rgba(248, 248, 250, 0.66));
  backdrop-filter: blur(16px) saturate(160%);
  -webkit-backdrop-filter: blur(16px) saturate(160%);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.22),
    inset 0 1px 1px rgb(255 255 255 / 0.5),
    inset 0 -1px 1px rgb(255 255 255 / 0.25);
  color: var(--ios-label, #000);
  font: 500 12px/1.3 system-ui, -apple-system, "Segoe UI", sans-serif;
}
.impeccable-bar * { box-sizing: border-box; }
.impeccable-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 650;
  letter-spacing: -0.01em;
}
.impeccable-mark {
  width: 9px; height: 9px;
  border-radius: 3px;
  background: var(--ios-tint, #007aff);
  box-shadow: 0 0 0 1px rgb(255 255 255 / 0.6) inset;
}
.impeccable-lang {
  margin-inline-start: auto;
  appearance: none;
  border: 0;
  border-radius: 999px;
  padding: 3px 9px;
  background: rgb(128 128 128 / 0.14);
  color: inherit;
  font: 600 11px/1.4 system-ui, sans-serif;
  cursor: pointer;
}
.impeccable-variants { display: flex; flex-wrap: wrap; gap: 5px; }
.impeccable-variants button {
  appearance: none;
  border: 0;
  border-radius: 999px;
  padding: 5px 10px;
  background: rgb(128 128 128 / 0.14);
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.impeccable-variants button[aria-pressed="true"] {
  background: var(--ios-tint, #007aff);
  color: #fff;
}
.impeccable-params { display: grid; gap: 6px; }
.impeccable-params:empty { display: none; }
.impeccable-param { display: grid; gap: 2px; }
.impeccable-param label {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--ios-label-2, rgba(60, 60, 67, 0.6));
}
.impeccable-param output { font-variant-numeric: tabular-nums; }
.impeccable-param input[type="range"] { width: 100%; accent-color: var(--ios-tint, #007aff); }
.impeccable-foot { display: flex; gap: 6px; }
.impeccable-foot button {
  appearance: none;
  border: 0;
  border-radius: 999px;
  padding: 6px 12px;
  font: inherit;
  cursor: pointer;
  background: rgb(128 128 128 / 0.14);
  color: inherit;
}
.impeccable-foot button[data-act="accept"] {
  background: var(--ios-tint, #007aff);
  color: #fff;
}
`;

const state = { wrapper: null, slots: [], active: 0, params: {}, lang: "fa" };

function readParams(el) {
  try {
    return JSON.parse(el.dataset.impeccableParams || "[]");
  } catch {
    return [];
  }
}

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

function renderParams(box, slotEl) {
  box.innerHTML = "";
  const defs = readParams(slotEl);
  const saved = state.params[state.slots[state.active].key] || {};
  for (const p of defs) {
    const wrap = document.createElement("div");
    wrap.className = "impeccable-param";
    const value = saved[p.id] ?? p.default;
    if (p.kind === "range") {
      wrap.innerHTML =
        `<label><span>${paramLabel(p)}</span><output></output></label>` +
        `<input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${value}">`;
      const input = wrap.querySelector("input");
      const out = wrap.querySelector("output");
      const sync = () => {
        out.textContent = input.value;
        applyParam(slotEl, p, input.value);
        (state.params[state.slots[state.active].key] ||= {})[p.id] = Number(input.value);
      };
      input.addEventListener("input", () => {
        sync();
        persist();
      });
      sync();
    } else if (p.kind === "toggle") {
      wrap.innerHTML = `<label><span>${paramLabel(p)}</span><input type="checkbox" ${value ? "checked" : ""}></label>`;
      const input = wrap.querySelector("input");
      input.addEventListener("change", () => {
        applyParam(slotEl, p, input.checked);
        (state.params[state.slots[state.active].key] ||= {})[p.id] = input.checked;
        persist();
      });
      applyParam(slotEl, p, !!value);
    } else if (p.kind === "steps") {
      wrap.innerHTML = `<label><span>${paramLabel(p)}</span></label>`;
      const row = document.createElement("div");
      row.className = "impeccable-variants";
      for (const opt of p.options) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = opt.label;
        b.setAttribute("aria-pressed", String(opt.value === value));
        b.addEventListener("click", () => {
          row.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", "false"));
          b.setAttribute("aria-pressed", "true");
          applyParam(slotEl, p, opt.value);
          (state.params[state.slots[state.active].key] ||= {})[p.id] = opt.value;
          persist();
        });
        row.append(b);
      }
      wrap.append(row);
      applyParam(slotEl, p, value);
    }
    box.append(wrap);
  }
}

function setVariant(i, silent) {
  state.active = i;
  state.slots.forEach((slot, n) => {
    slot.el.style.display = n === i ? (slot.key === "original" ? "" : "contents") : "none";
  });
  const bar = document.querySelector(".impeccable-bar");
  bar.querySelectorAll(".impeccable-variants > button").forEach((b, n) =>
    b.setAttribute("aria-pressed", String(n === i))
  );
  renderParams(bar.querySelector(".impeccable-params"), state.slots[i].el);
  if (!silent) persist();
}

function refreshLabels() {
  const t = UI[uiLang()];
  const bar = document.querySelector(".impeccable-bar");
  bar.setAttribute("aria-label", t.bar);
  bar.querySelector('[data-act="reset"]').textContent = t.reset;
  bar.querySelector('[data-act="accept"]').textContent = t.accept;
  bar.querySelector(".impeccable-lang").textContent = t.lang;
  bar.querySelectorAll(".impeccable-variants > button").forEach((b, i) => {
    const slot = state.slots[i];
    if (slot.key !== "original") {
      const localized = slot.el.dataset[uiLang()];
      if (localized) slot.el.dataset.impeccableVariantLabel = localized;
    }
    b.textContent =
      slot.key === "original" ? t.original : slot.el.dataset.impeccableVariantLabel || `V${i}`;
  });
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

  const bar = document.createElement("aside");
  bar.className = "impeccable-bar";
  bar.innerHTML =
    `<span class="impeccable-head"><span class="impeccable-mark"></span>Impeccable · live` +
    `<button type="button" class="impeccable-lang"></button></span>` +
    `<div class="impeccable-variants"></div>` +
    `<div class="impeccable-params"></div>` +
    `<div class="impeccable-foot">` +
    `<button type="button" data-act="reset"></button>` +
    `<button type="button" data-act="accept"></button>` +
    `</div>`;
  document.body.append(bar);

  const vrow = bar.querySelector(".impeccable-variants");
  state.slots.forEach((slot, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.addEventListener("click", () => setVariant(i));
    vrow.append(b);
  });

  bar.querySelector(".impeccable-lang").addEventListener("click", () => {
    state.lang = uiLang() === "fa" ? "en" : "fa";
    refreshLabels();
    renderParams(bar.querySelector(".impeccable-params"), state.slots[state.active].el);
    applyLocale();
    persist();
  });
  bar.querySelector('[data-act="reset"]').addEventListener("click", () => {
    delete state.params[state.slots[state.active].key];
    const el = state.slots[state.active].el;
    for (const p of readParams(el)) {
      el.style.removeProperty(`--p-${p.id}`);
      el.removeAttribute(`data-p-${p.id}`);
    }
    renderParams(bar.querySelector(".impeccable-params"), el);
    persist();
  });
  bar.querySelector('[data-act="accept"]').addEventListener("click", () => {
    persist();
    document.dispatchEvent(
      new CustomEvent("impeccable-accept", { detail: window.__impeccableAccept })
    );
  });
  document.addEventListener("impeccable-locale", refreshLabels);

  let start = 0;
  const saved = JSON.parse(localStorage.getItem(STORE) || "null");
  const hash = (location.hash.match(/#v=([\w-]+)/) || [])[1];
  const pick = hash || saved?.variant;
  if (pick) {
    const i = state.slots.findIndex((s) => s.key === pick);
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
