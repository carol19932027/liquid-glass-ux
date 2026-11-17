/* <ios-tab-bar> — the iOS 27 tab bar as a web component (DESIGN.md §1 row 1,
   §4). ES module, shadow DOM, no build step, no dependencies.

   looks (native variants, chosen from the impeccable toolbar):
     capsule  floating capsule, minimizes on scroll-down (iOS 26/27 default)
     band     edge-to-edge bottom band with a top hairline
     search   capsule with the iOS 27 re-integrated trailing search tab
     dock     compact symbols-only dock capsule

   API: `items` property or attribute — JSON array of
   { id, label, icon } with icon from the built-in symbol set.
   Selection fires `change` with { tab }. Tune knobs (--p-blur,
   --p-intensity, --p-specular, --p-radius) come from the impeccable
   toolbar params and inherit into the shadow tree. */

const uid = () => Math.random().toString(36).slice(2, 8);

const ICONS = {
  home: '<path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.8"/><rect x="13" y="4" width="7" height="7" rx="1.8"/><rect x="4" y="13" width="7" height="7" rx="1.8"/><rect x="13" y="13" width="7" height="7" rx="1.8"/>',
  sparkle: '<path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18.5 10.2 12.6 4.5 10.8 10.2 9z"/><path d="M18.5 16.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
  search: '<circle cx="10.8" cy="10.8" r="5.8"/><path d="m15.2 15.2 4.3 4.3"/>',
  bell: '<path d="M12 4a5.5 5.5 0 0 1 5.5 5.5c0 4 1.5 5.5 1.5 5.5H5s1.5-1.5 1.5-5.5A5.5 5.5 0 0 1 12 4Z"/><path d="M10.3 18.5a1.8 1.8 0 0 0 3.4 0"/>',
};

const STYLE = `
:host {
  position: fixed;
  left: 0;
  right: 0;
  bottom: calc(10px + env(safe-area-inset-bottom, 0px));
  display: flex;
  justify-content: center;
  pointer-events: none;
  z-index: 60;
  /* tune knobs, authored with fallbacks to the DESIGN.md tokens */
  --blur: calc(var(--p-blur, 18) * 1px);
  --radius: calc(var(--p-radius, 28) * 1px);
  --spec: var(--p-specular, 1);
  --tint: color-mix(
    in oklab,
    var(--ios-glass-tint-thick) calc(var(--p-intensity, 0.5) * 100%),
    var(--ios-glass-tint-clear)
  );
}
:host([look="band"]) { bottom: 0; }
.bar {
  pointer-events: auto;
  position: relative;
  display: flex;
  align-items: stretch;
  gap: 2px;
  min-height: var(--ios-target, 44px);
  padding: 5px 8px;
  border-radius: min(var(--radius), 999px);
  background-color: var(--tint);
  border: 1px solid rgb(var(--ios-rim, 255 255 255) / calc(var(--ios-rim-border, 0.18) * var(--spec)));
  box-shadow:
    var(--ios-lift, 0 8px 32px rgba(0, 0, 0, 0.25)),
    inset 0 1px 1px rgb(var(--ios-rim, 255 255 255) / calc(var(--ios-rim-top, 0.55) * var(--spec))),
    inset 0 -1px 1px rgb(var(--ios-rim, 255 255 255) / calc(var(--ios-rim-side, 0.2) * var(--spec))),
    inset 1px 0 1px rgb(var(--ios-rim, 255 255 255) / calc(var(--ios-rim-side, 0.2) * var(--spec))),
    inset -1px 0 1px rgb(var(--ios-rim, 255 255 255) / calc(var(--ios-rim-side, 0.2) * var(--spec)));
  backdrop-filter: blur(var(--blur)) saturate(var(--ios-glass-saturate, 160%))
    brightness(var(--ios-glass-brightness, 1.06)) contrast(var(--ios-glass-contrast, 1.04));
  -webkit-backdrop-filter: blur(var(--blur)) saturate(var(--ios-glass-saturate, 160%))
    brightness(var(--ios-glass-brightness, 1.06)) contrast(var(--ios-glass-contrast, 1.04));
  transition: padding 0.35s cubic-bezier(0.3, 1.6, 0.45, 1),
    min-height 0.35s cubic-bezier(0.3, 1.6, 0.45, 1);
}
@supports (backdrop-filter: url("#x")) {
  .bar {
    backdrop-filter: blur(var(--blur)) saturate(var(--ios-glass-saturate, 160%))
      brightness(var(--ios-glass-brightness, 1.06)) contrast(var(--ios-glass-contrast, 1.04))
      url("#__REFRACT__");
  }
}
:host([look="band"]) .bar {
  width: 100%;
  justify-content: stretch;
  border-radius: 0;
  border-inline: 0;
  border-bottom: 0;
  padding: 6px 12px calc(6px + env(safe-area-inset-bottom, 0px));
  box-shadow:
    inset 0 1px 0 var(--ios-separator, rgba(60, 60, 67, 0.29)),
    inset 0 2px 1px rgb(var(--ios-rim, 255 255 255) / calc(var(--ios-rim-top, 0.55) * var(--spec) * 0.5));
}
:host([look="dock"]) .bar,
:host([minimized]) .bar { padding: 5px 10px; }
:host([minimized]) .bar { min-height: 42px; }

.tab {
  appearance: none;
  border: 0;
  background: none;
  color: var(--ios-tab-inactive, rgba(60, 60, 67, 0.78));
  font: 600 11px/1.15 system-ui, -apple-system, "Segoe UI", sans-serif;
  letter-spacing: -0.01em;
  display: grid;
  justify-items: center;
  align-content: center;
  gap: 3px;
  min-width: var(--ios-target, 44px);
  padding: 4px 12px;
  border-radius: 999px;
  cursor: pointer;
  transition: color 0.25s cubic-bezier(0.3, 1.6, 0.45, 1), scale 0.3s cubic-bezier(0.3, 1.6, 0.45, 1);
}
.tab svg {
  width: 24px;
  height: 24px;
  display: block;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.tab:active { scale: 0.94; }
.tab:focus-visible { outline: 2px solid var(--ios-tint, #007aff); outline-offset: 2px; }
.tab[aria-current="page"] { color: var(--ios-tab-active, #0060d6); }
.tab[aria-current="page"] svg { stroke-width: 2.1; }
:host([minimized]) .tab span,
:host([look="dock"]) .tab span { display: none; }
:host([minimized]) .tab,
:host([look="dock"]) .tab { padding: 4px 10px; }

:host([look="band"]) .tab { flex: 1; }

.divider {
  width: 1px;
  margin: 8px 2px;
  background: var(--ios-separator, rgba(60, 60, 67, 0.29));
}
:host(:not([look="search"])) .divider { display: none; }

@media (prefers-reduced-motion: reduce) {
  .bar, .tab { transition-duration: 1ms; }
}
`;

const REFRACT_SVG = (id) => `
<svg width="0" height="0" aria-hidden="true" style="position:absolute">
  <filter id="${id}" x="-20%" y="-20%" width="140%" height="140%">
    <feDisplacementMap in="SourceGraphic" scale="12" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
</svg>`;

class IosTabBar extends HTMLElement {
  static get observedAttributes() {
    return ["look", "minimized", "items"];
  }

  constructor() {
    super();
    const id = `ios-refract-${uid()}`;
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML =
      `<style>${STYLE.replace("__REFRACT__", id)}</style>${REFRACT_SVG(id)}` +
      `<nav class="bar" part="bar" aria-label=""></nav>`;
    this._bar = root.querySelector(".bar");
    this._items = [];
    this._lastY = 0;
    this._bar.addEventListener("click", (e) => {
      const tab = e.target.closest(".tab");
      if (tab) this.select(tab.dataset.tab);
    });
    this._bar.addEventListener("keydown", (e) => {
      const tabs = this.tabs;
      const i = tabs.indexOf(e.target.closest(".tab"));
      if (i < 0) return;
      const rtl = getComputedStyle(this).direction === "rtl";
      const fwd = e.key === (rtl ? "ArrowLeft" : "ArrowRight");
      const back = e.key === (rtl ? "ArrowRight" : "ArrowLeft");
      const to = fwd ? i + 1 : back ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : -1;
      if (to < 0 || to >= tabs.length) return;
      e.preventDefault();
      this.select(tabs[to].dataset.tab);
      tabs[to].focus();
    });
    this._onScroll = () => {
      const y = this._scroller ? this._scroller.scrollTop : window.scrollY;
      const down = y > this._lastY + 6 && y > 140;
      const up = y < this._lastY - 6;
      this._lastY = y;
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      if (down && this.look === "capsule") this.setAttribute("minimized", "");
      if (up) this.removeAttribute("minimized");
    };
  }

  connectedCallback() {
    if (!this.hasAttribute("look")) this.setAttribute("look", "capsule");
    const sel = this.getAttribute("scroll-target");
    this._scroller = sel ? document.querySelector(sel) : null;
    (this._scroller ?? window).addEventListener("scroll", this._onScroll, { passive: true });
    if (this.hasAttribute("items")) this._readItems();
    if (!this._bar.querySelector(".tab") && this._items.length) this._render();
  }

  disconnectedCallback() {
    (this._scroller ?? window).removeEventListener("scroll", this._onScroll);
  }

  attributeChangedCallback(name, oldV, newV) {
    if (name === "items" && oldV !== newV) this._readItems();
    if (name === "look" && this._items.length) this._render();
  }

  get items() {
    return this._items;
  }

  set items(value) {
    this._items = Array.isArray(value) ? value : [];
    this._render();
  }

  get look() {
    return this.getAttribute("look") || "capsule";
  }

  get tabs() {
    return Array.from(this._bar.querySelectorAll(".tab"));
  }

  _readItems() {
    try {
      this._items = JSON.parse(this.getAttribute("items")) || [];
    } catch {
      this._items = [];
    }
    this._render();
  }

  _render() {
    const current = this._bar.querySelector('[aria-current="page"]')?.dataset.tab;
    const list = this._items.map((it) => ({ ...it }));
    this._bar.innerHTML = "";
    for (const [i, it] of list.entries()) {
      if (this.look === "search" && i === list.length - 1) {
        const d = document.createElement("span");
        d.className = "divider";
        d.setAttribute("aria-hidden", "true");
        this._bar.append(d);
      }
      const b = document.createElement("button");
      b.type = "button";
      b.className = "tab";
      b.dataset.tab = it.id;
      b.innerHTML =
        `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[it.icon] || ICONS.grid}</svg>` +
        (it.label ? `<span>${it.label}</span>` : "");
      if (it.label) b.setAttribute("aria-label", it.label);
      this._bar.append(b);
    }
    this.select(current || list[0]?.id, true);
  }

  select(id, silent) {
    for (const t of this.tabs) {
      const on = t.dataset.tab === id;
      if (on) t.setAttribute("aria-current", "page");
      else t.removeAttribute("aria-current");
      t.tabIndex = on ? 0 : -1;
    }
    if (!silent && id)
      this.dispatchEvent(new CustomEvent("change", { detail: { tab: id }, bubbles: true }));
  }
}

customElements.define("ios-tab-bar", IosTabBar);
