/* <ios-tab-bar> — the iOS 26/27 liquid-glass tab bar as a web component
   (DESIGN.md §1 row 1, §4). ES module, shadow DOM, no build step, no
   dependencies. Visual targets are system screenshots, not invention:

   - floating capsule spans the width with ~10pt side margins (native is
     never content-hugged); items distribute evenly;
   - FILLED SF-Symbol-style glyphs (~26pt) with a 10.5pt label under;
   - the selected tab sits on a glass "lens" bubble that springs between
     tabs — the signature iOS 26 selection treatment;
   - capsule glass: strong diffusion, top-weighted specular rim, darker
     bottom edge (iOS 27 re-leveling), full corner radius;
   - minimize-on-scroll-down collapses labels (`.tabBarMinimizeBehavior`);
   - looks: capsule (default) / band (classic edge-to-edge UITabBar, no
     lens) / search (iOS 27 re-integrated trailing search tab) / dock
     (compact content-hugged, symbols only).

   API: `items` property or attribute — JSON array of { id, label, icon }
   with icon from the built-in symbol set. Selection fires `change`.
   Tune knobs (--p-*) come from the impeccable toolbar params and inherit
   into the shadow tree. */

const uid = () => Math.random().toString(36).slice(2, 8);

/* filled variants, the way SF Symbols switches on selection-off/on */
const ICONS = {
  home: {
    fill: '<path fill-rule="evenodd" d="M11.4 3.3a1 1 0 0 1 1.2 0l7.6 6.2c.24.2.38.48.38.78v9.42a1.3 1.3 0 0 1-1.3 1.3h-4.35a.45.45 0 0 1-.45-.45v-5.1a.9.9 0 0 0-.9-.9h-3.16a.9.9 0 0 0-.9.9v5.1a.45.45 0 0 1-.45.45H4.72a1.3 1.3 0 0 1-1.3-1.3V10.3c0-.3.14-.59.38-.78Z"/>',
  },
  grid: {
    fill: '<rect x="3.6" y="3.6" width="7.3" height="7.3" rx="2"/><rect x="13.1" y="3.6" width="7.3" height="7.3" rx="2"/><rect x="3.6" y="13.1" width="7.3" height="7.3" rx="2"/><rect x="13.1" y="13.1" width="7.3" height="7.3" rx="2"/>',
  },
  sparkle: {
    fill: '<path d="M12 2.6c.24 0 .45.16.52.39l1.5 4.72 4.72 1.5a.55.55 0 0 1 0 1.05l-4.72 1.5-1.5 4.72a.55.55 0 0 1-1.05 0l-1.5-4.72-4.72-1.5a.55.55 0 0 1 0-1.05l4.72-1.5 1.5-4.72c.08-.23.29-.39.53-.39Z"/><path d="M18.9 15.4c.12 0 .23.08.27.2l.72 2.01 2.01.72a.29.29 0 0 1 0 .55l-2.01.72-.72 2.01a.29.29 0 0 1-.55 0l-.72-2.01-2.01-.72a.29.29 0 0 1 0-.55l2.01-.72.72-2.01c.04-.12.15-.2.28-.2Z"/>',
  },
  search: {
    stroke: '<circle cx="10.6" cy="10.6" r="6.1"/><path d="m15.1 15.1 4.6 4.6"/>',
  },
  bell: {
    fill: '<path d="M12 2.8a6 6 0 0 1 6 6c0 3.6 1.2 5.2 1.7 5.9.24.33 0 .8-.4.8H4.7c-.4 0-.64-.47-.4-.8.5-.7 1.7-2.3 1.7-5.9a6 6 0 0 1 6-6Z"/><path d="M9.9 18.6a2.1 2.1 0 0 0 4.2 0Z"/>',
  },
};

const STYLE = `
:host {
  position: fixed;
  inset-inline: 10px;
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
  --lens: rgb(255 255 255 / 0.5);
  --lens-rim: rgb(255 255 255 / 0.65);
  --lens-shade: rgb(0 0 0 / 0.06);
}
@media (prefers-color-scheme: dark) {
  :host {
    --lens: rgb(255 255 255 / 0.14);
    --lens-rim: rgb(255 255 255 / 0.22);
    --lens-shade: rgb(0 0 0 / 0.28);
  }
}
:host([look="dock"]) { inset-inline: auto; }
:host([look="band"]) { inset-inline: 0; bottom: 0; }

.bar {
  pointer-events: auto;
  position: relative;
  box-sizing: border-box;
  display: flex;
  align-items: stretch;
  width: 100%;
  min-height: 64px;
  padding: 5px 6px;
  border-radius: min(var(--radius), 999px);
  background-color: var(--tint);
  border: 1px solid rgb(var(--ios-rim, 255 255 255) / calc(var(--ios-rim-border, 0.18) * var(--spec)));
  box-shadow:
    var(--ios-lift, 0 8px 32px rgba(0, 0, 0, 0.25)),
    inset 0 1px 1px rgb(var(--ios-rim, 255 255 255) / calc(var(--ios-rim-top, 0.55) * var(--spec))),
    inset 0 -1px 1px rgb(0 0 0 / calc(0.1 * var(--spec))),
    inset 1px 0 1px rgb(var(--ios-rim, 255 255 255) / calc(var(--ios-rim-side, 0.2) * var(--spec))),
    inset -1px 0 1px rgb(var(--ios-rim, 255 255 255) / calc(var(--ios-rim-side, 0.2) * var(--spec)));
  backdrop-filter: blur(var(--blur)) saturate(var(--ios-glass-saturate, 160%))
    brightness(var(--ios-glass-brightness, 1.06)) contrast(var(--ios-glass-contrast, 1.04));
  -webkit-backdrop-filter: blur(var(--blur)) saturate(var(--ios-glass-saturate, 160%))
    brightness(var(--ios-glass-brightness, 1.06)) contrast(var(--ios-glass-contrast, 1.04));
  transition: min-height 0.35s cubic-bezier(0.3, 1.6, 0.45, 1),
    padding 0.35s cubic-bezier(0.3, 1.6, 0.45, 1);
}
@supports (backdrop-filter: url("#x")) {
  .bar {
    backdrop-filter: blur(var(--blur)) saturate(var(--ios-glass-saturate, 160%))
      brightness(var(--ios-glass-brightness, 1.06)) contrast(var(--ios-glass-contrast, 1.04))
      url("#__REFRACT__");
  }
}
:host([look="band"]) .bar {
  border-radius: 0;
  border-inline: 0;
  border-bottom: 0;
  padding: 6px 10px calc(6px + env(safe-area-inset-bottom, 0px));
  box-shadow:
    inset 0 1px 0 var(--ios-separator, rgba(60, 60, 67, 0.29)),
    inset 0 2px 1px rgb(var(--ios-rim, 255 255 255) / calc(var(--ios-rim-top, 0.55) * var(--spec) * 0.5));
}
:host([look="dock"]) .bar { width: max-content; padding: 6px 8px; }
:host([minimized]) .bar { min-height: 48px; padding: 4px 6px; }

/* the iOS 26 selection lens: a glass bubble under the active tab */
.lens {
  position: absolute;
  top: 5px;
  bottom: 5px;
  border-radius: 999px;
  background: var(--lens);
  box-shadow:
    inset 0 1px 0 var(--lens-rim),
    inset 0 0 0 1px rgb(255 255 255 / 0.08),
    0 1px 2px var(--lens-shade);
  transition: left 0.38s cubic-bezier(0.3, 1.6, 0.45, 1),
    width 0.38s cubic-bezier(0.3, 1.6, 0.45, 1),
    top 0.35s cubic-bezier(0.3, 1.6, 0.45, 1),
    bottom 0.35s cubic-bezier(0.3, 1.6, 0.45, 1);
}
:host([look="band"]) .lens { display: none; }
:host([minimized]) .lens { top: 4px; bottom: 4px; }

.tab {
  appearance: none;
  border: 0;
  background: none;
  box-sizing: border-box;
  position: relative;
  flex: 1;
  color: var(--ios-tab-inactive, rgba(60, 60, 67, 0.78));
  font: 500 10.5px/1.15 system-ui, -apple-system, "Segoe UI", sans-serif;
  letter-spacing: -0.01em;
  display: grid;
  justify-items: center;
  align-content: center;
  gap: 3px;
  min-width: var(--ios-target, 44px);
  padding: 4px 6px;
  cursor: pointer;
  transition: color 0.25s cubic-bezier(0.3, 1.6, 0.45, 1), scale 0.3s cubic-bezier(0.3, 1.6, 0.45, 1);
}
:host([look="dock"]) .tab { flex: 0 0 auto; padding: 4px 10px; }
.tab svg { width: 26px; height: 26px; display: block; }
.tab svg .f { fill: currentColor; }
.tab svg .s { fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }
.tab:active { scale: 0.94; }
.tab:focus-visible { outline: 2px solid var(--ios-tint, #007aff); outline-offset: 2px; border-radius: 999px; }
.tab[aria-current="page"] { color: var(--ios-tab-active, #0060d6); }
:host([minimized]) .tab span,
:host([look="dock"]) .tab span { display: none; }

.divider {
  width: 1px;
  margin: 10px 2px;
  background: var(--ios-separator, rgba(60, 60, 67, 0.29));
}
:host(:not([look="search"])) .divider { display: none; }
:host([look="search"]) .tab[data-tab="__search_spacer"] { display: none; }

@media (prefers-reduced-motion: reduce) {
  .bar, .tab, .lens { transition-duration: 1ms; }
}
`;

const REFRACT_SVG = (id) => `
<svg width="0" height="0" aria-hidden="true" style="position:absolute">
  <filter id="${id}" x="-20%" y="-20%" width="140%" height="140%">
    <feDisplacementMap in="SourceGraphic" scale="12" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
</svg>`;

const iconSvg = (name) => {
  const ic = ICONS[name] || ICONS.grid;
  const inner = ic.fill
    ? ic.fill.replace(/<(path|rect|circle)/g, '<$1 class="f"')
    : ic.stroke.replace(/<(circle|path)/g, "<$1 class=\"s\"");
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;
};

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
      `<nav class="bar" part="bar"><span class="lens" aria-hidden="true"></span></nav>`;
    this._bar = root.querySelector(".bar");
    this._lens = root.querySelector(".lens");
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
    this._onResize = () => this._placeLens(true);
  }

  connectedCallback() {
    if (!this.hasAttribute("look")) this.setAttribute("look", "capsule");
    const sel = this.getAttribute("scroll-target");
    this._scroller = sel ? document.querySelector(sel) : null;
    (this._scroller ?? window).addEventListener("scroll", this._onScroll, { passive: true });
    window.addEventListener("resize", this._onResize);
    if (this.hasAttribute("items")) this._readItems();
    if (!this._bar.querySelector(".tab") && this._items.length) this._render();
    this._ro = new ResizeObserver(() => this._placeLens(true));
    this._ro.observe(this._bar);
  }

  disconnectedCallback() {
    (this._scroller ?? window).removeEventListener("scroll", this._onScroll);
    window.removeEventListener("resize", this._onResize);
    this._ro?.disconnect();
  }

  attributeChangedCallback(name, oldV, newV) {
    if (name === "items" && oldV !== newV) this._readItems();
    if ((name === "look" || name === "minimized") && this._items.length) {
      this._placeLens(true);
    }
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
    this._bar.querySelectorAll(".tab, .divider").forEach((n) => n.remove());
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
      b.innerHTML = iconSvg(it.icon) + (it.label ? `<span>${it.label}</span>` : "");
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
    this._placeLens();
    if (!silent && id)
      this.dispatchEvent(new CustomEvent("change", { detail: { tab: id }, bubbles: true }));
  }

  /* seat the lens bubble under the active tab, native-style */
  _placeLens(instant) {
    const active = this._bar.querySelector('[aria-current="page"]');
    if (!active || this.look === "band") {
      this._lens.style.opacity = "0";
      return;
    }
    this._lens.style.opacity = "1";
    const bar = this._bar.getBoundingClientRect();
    const r = active.getBoundingClientRect();
    const pad = 3;
    if (instant) this._lens.style.transition = "none";
    this._lens.style.left = r.left - bar.left - pad + "px";
    this._lens.style.width = r.width + pad * 2 + "px";
    if (instant) {
      void this._lens.offsetWidth;
      this._lens.style.transition = "";
    }
  }
}

customElements.define("ios-tab-bar", IosTabBar);
