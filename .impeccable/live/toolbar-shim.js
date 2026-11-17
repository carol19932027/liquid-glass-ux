/* Impeccable live toolbar — dependency-free shim of the skill's live bar
   (reference/live.md) for environments where the engine binary cannot be
   installed. It speaks the skill's exact contract: [data-impeccable-variants]
   wrappers, [data-impeccable-variant="N"] children (first visible, rest
   display:none), and data-impeccable-params knobs (range/steps/toggle)
   docked one control per parameter, driving --p-<id> / data-p-<id> on the
   variant root. Selection persists to localStorage and mirrors in the URL
   hash so headless passes and teammates can reopen the same state. */

const STORE = "impeccable-live-selection";

const css = `
.impeccable-bar {
  position: fixed;
  inset-inline-end: 14px;
  bottom: calc(86px + env(safe-area-inset-bottom, 0px));
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
.impeccable-param { display: grid; gap: 2px; }
.impeccable-param label {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--ios-label-2, rgba(60, 60, 67, 0.6));
}
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

const state = { wrapper: null, variants: [], active: 0, params: {} };

const UI = {
  fa: { accept: "پذیرش", reset: "بازنشانی tune", bar: "نوار ابزار زندهٔ impeccable" },
  en: { accept: "Accept", reset: "Reset tune", bar: "Impeccable live toolbar" },
};
const uiLang = () => (document.documentElement.lang || "en").startsWith("fa") ? "fa" : "en";
const paramLabel = (p) =>
  uiLang() === "fa" && p.labelFa ? p.labelFa : p.label;

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
  const sel = {
    variant: state.active + 1,
    params: state.params,
  };
  localStorage.setItem(STORE, JSON.stringify(sel));
  history.replaceState(null, "", `#v=${sel.variant}`);
  window.__impeccableAccept = sel;
}

function renderParams(box, variantEl) {
  box.innerHTML = "";
  const defs = readParams(variantEl);
  const saved = state.params[state.active + 1] || {};
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
        applyParam(variantEl, p, input.value);
        (state.params[state.active + 1] ||= {})[p.id] = Number(input.value);
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
        applyParam(variantEl, p, input.checked);
        (state.params[state.active + 1] ||= {})[p.id] = input.checked;
        persist();
      });
      applyParam(variantEl, p, !!value);
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
          applyParam(variantEl, p, opt.value);
          (state.params[state.active + 1] ||= {})[p.id] = opt.value;
          persist();
        });
        row.append(b);
      }
      wrap.append(row);
      applyParam(variantEl, p, value);
    }
    box.append(wrap);
  }
}

function setVariant(i, silent) {
  state.active = i;
  state.variants.forEach((el, n) => {
    el.style.display = n === i ? "contents" : "none";
  });
  const bar = document.querySelector(".impeccable-bar");
  bar.querySelectorAll(".impeccable-variants > button").forEach((b, n) =>
    b.setAttribute("aria-pressed", String(n === i))
  );
  renderParams(bar.querySelector(".impeccable-params"), state.variants[i]);
  if (!silent) persist();
}

export function mountToolbar() {
  const wrapper = document.querySelector("[data-impeccable-variants]");
  if (!wrapper) return null;
  state.wrapper = wrapper;
  state.variants = Array.from(wrapper.querySelectorAll(":scope > [data-impeccable-variant]"));

  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);

  const bar = document.createElement("aside");
  bar.className = "impeccable-bar";
  bar.setAttribute("aria-label", UI[uiLang()].bar);
  bar.innerHTML =
    `<span class="impeccable-head"><span class="impeccable-mark"></span>Impeccable · live</span>` +
    `<div class="impeccable-variants"></div>` +
    `<div class="impeccable-params"></div>` +
    `<div class="impeccable-foot">` +
    `<button type="button" data-act="reset"></button>` +
    `<button type="button" data-act="accept"></button>` +
    `</div>`;
  document.body.append(bar);

  const vrow = bar.querySelector(".impeccable-variants");
  state.variants.forEach((el, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.addEventListener("click", () => setVariant(i));
    vrow.append(b);
  });
  const refreshLabels = () => {
    const t = UI[uiLang()];
    bar.setAttribute("aria-label", t.bar);
    bar.querySelector('[data-act="reset"]').textContent = t.reset;
    bar.querySelector('[data-act="accept"]').textContent = t.accept;
    vrow.querySelectorAll("button").forEach((b, i) => {
      b.textContent = state.variants[i].dataset.impeccableVariantLabel || `V${i + 1}`;
    });
  };
  refreshLabels();
  document.addEventListener("impeccable-locale", () => {
    refreshLabels();
    renderParams(bar.querySelector(".impeccable-params"), state.variants[state.active]);
  });

  bar.querySelector('[data-act="reset"]').addEventListener("click", () => {
    delete state.params[state.active + 1];
    const el = state.variants[state.active];
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

  let start = 0;
  const saved = JSON.parse(localStorage.getItem(STORE) || "null");
  const hash = Number((location.hash.match(/#v=(\d+)/) || [])[1]);
  if (hash >= 1 && hash <= state.variants.length) start = hash - 1;
  else if (saved?.variant >= 1 && saved?.variant <= state.variants.length) start = saved.variant - 1;
  if (saved?.params) state.params = saved.params;
  setVariant(start, true);
  return bar;
}

if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", mountToolbar);
else mountToolbar();
