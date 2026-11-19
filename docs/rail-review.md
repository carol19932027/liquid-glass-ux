# Navigation rail review — the bar and its items, audited against DESIGN.md

Scope: the study's morph rail (`index.html` markup, `src/demo.css` rail block,
`src/main.ts` rail logic) and, for comparison, the PWA component
`components/ios-tab-bar.js`. Review only — **no rail visual was changed by
this document**; every number below is reproducible with `npm run review:rail`
(`scripts/review-rail.mjs`, read-only probe; crops and JSON land in
`verify-artifacts/review-*`). Headless Chromium, 1440×900 and 390/320-wide
viewports, both page appearances (light top section, `html.end-dark` bottom).

Contrast method: tight clip around one item, pixels sorted by relative
luminance, ink tail (p02 dark appearance-independent, p98 bright) against the
glass median → WCAG ratio. Platform font via CDP
`CSS.getPlatformFontsForNode`.

## 1. Snapshot (measured, current head)

| Item | Box (px) | Ink vs glass, light | Ink vs glass, dark |
|---|---|---|---|
| Bell button (alert) | 56×56 | glyph 9.5:1 | glyph 18.44:1 |
| Badge | 18×18, font 11px/600 | **3.46:1** (white on `#ff3b30`) | **3.46:1** |
| Tab, selected | 62.5–71.1 × **33.5** | 7.47:1 | 13.42:1 |
| Tab, unselected | 62.5–71.1 × **33.5** | **4.41:1** | 9.65:1 |
| Rail shell | 322×56, bottom gap 25.3 @844h / 17 @568h | — | — |

Geometry: calm = pill centred (256 wide) with the bell melted to width 0 and
properly unfocusable (`aria-hidden`, `tabindex=-1`, no `href`); alert = bell
56×56 at the left + pill in its fixed slot; tab boxes travel with the host
without relative drift in either state. Reduced motion collapses every rail
transition to 1 ms and kills the nudge animation. RTL island works: first tab
rightmost, ArrowLeft = forward.

## 2. Findings — must fix

1. **Unselected label misses WCAG AA in light** — 4.41:1 for 13px/500 text
   (`src/demo.css:920`, `opacity: 0.72` on the label span). 0.09 short of
   4.5:1. DESIGN.md §2 reserves `--ios-label-2` (60 % alpha) for inactive
   tabs; over *glass on light content* that reads even fainter. Raise to ≥
   0.78 (the component's own default) or composite against the measured
   glass luminance.
2. **Badge text fails AA in both appearances** — 3.46:1, white on `#ff3b30`
   (`src/demo.css:828-829`) at 11px semibold. Native-faithful, not
   accessible: either darken the red to a token (`--ios-badge`) that clears
   4.5:1 with white, or move the count to 12px/700 + darker red. Also the
   red and the white are hard-coded hex, while DESIGN.md §2 says components
   consume tokens.
3. **Tab targets are 33.5 px tall** — DESIGN.md §3: every target ≥ 44×44 pt.
   The bar is 56 px tall but the buttons only occupy 33.5 (`padding: 7px
   14px`, `src/demo.css:897`). 12 px block padding (or an inset hit-area
   pseudo) reaches 44+ without moving the ink pill.
4. **No safe-area inset** — `bottom: clamp(16px, 3vh, 28px)`
   (`src/demo.css:668`) parks the rail 17–25 px above the viewport edge,
   inside the iPhone home-indicator zone (34 pt). DESIGN.md §3: safe-area
   insets own the edges; the repo's own component already does
   `env(safe-area-inset-bottom)`. Add it to the clamp.
5. **Fixed 322 px footprint overflows small phones** — at 320 px wide the
   capsule clips −1/+1 px (measured), i.e. zero side margin, floating
   look gone; at 390 px the margin is 34 px (fine). `--rail-w: 322px`
   (`src/demo.css:663`) has no `min()`/clamp against the viewport.
6. **Incomplete tabs pattern** — `role="tablist"` + `role="tab"` with no
   `aria-controls` and no tabpanels anywhere (`index.html:233`). ARIA APG
   requires each tab to own a panel; screen readers announce "tab, 1 of 3"
   and then find nothing. The rail is a navigation, and the repo's own
   component gets this right with buttons + `aria-current="page"`. Either
   give the tabs real panels or switch the rail to the same
   `aria-current` pattern. Related: `nav aria-label="Navigation"` wrapping
   `tablist aria-label="ناوبری"` is a duplicated, bilingual landmark name.
7. **HTML injection through the component's `items` attribute** —
   `b.innerHTML = iconSvg(it.icon) + \`<span>${it.label}</span>\``
   (`components/ios-tab-bar.js:306`). Labels are author data today but the
   attribute is a public API; a CMS-driven label with markup lands in the
   shadow tree. Use `textContent` for the label span.

## 3. Findings — should fix (fidelity & consistency)

8. **No Persian webfont** — CDP reports the Persian labels render in
   *DejaVu Sans* here (platform fallback); the stack is Figtree (latin
   unicode-ranges) then `Figtree metrics` → local Arial/Helvetica
   (`src/demo.css:38,197-226`). On Windows/macOS the same labels render in
   Segoe UI / SF Arabic fallback: different metrics, different weight
   rendering, no Persian-specific typeface for a Persian-first UI.
9. **Selection treatment is the weakest interaction in the bar** — the
   selected tab gains a 13 % `currentColor` ink pill via a 250 ms opacity
   fade (`src/demo.css:908-943`); no `--ios-tint` (DESIGN.md §4 asks for
   tinted symbol + label), no lens bubble, no travel between tabs. The
   component ships exactly that spring (`_placeLens`, 0.38 s pop curve) —
   the study rail should adopt it or document why it deviates.
10. **Tabs carry no symbols** — DESIGN.md §4 and the component render
    symbol + label; the rail is label-only, which also makes the native
    minimize-to-symbols behaviour (§1 row 1) impossible to carry over.
    The bell glyph (18 px in a 56 px circle, 32 % fill) is likewise small
    next to iOS's ~26 pt symbols.
11. **Physical properties block RTL mirroring** — `left`, `margin-left`,
    badge `right` (`src/demo.css:668,721,821,867`) in a Persian-first UI
    whose tabs host is an RTL island. Logical properties
    (`inset-inline-start`, `margin-inline-start`) would let the whole rail
    mirror; today only the labels do. (Bell-on-the-left is a deliberate,
    user-directed choice — keep the position, fix the property kind.)
12. **Hard-coded inks, no tokens on the page** — `--ios-label/-2/-tint`
    resolve to empty strings on `:root`: the demo page never links
    `components/ios-tokens.css`, so the rail invents `oklch(0.34 …)` /
    `oklch(0.97 …)` and `#ff3b30`. Three parallel colour systems now exist
    (DESIGN.md table, component defaults, rail literals); the component's
    own defaults drift too (`--ios-tab-inactive` .78 vs label-2 .60;
    `--ios-tab-active` `#0060d6` vs `--ios-tint` `#007AFF`).
13. **Sticky hover on touch** — `:hover::before { opacity: 0.45 }`
    (`src/demo.css:929`) has no `@media (hover: hover)` guard, so a tapped
    tab keeps its hover tint on mobile Safari/Chrome.
14. **`prefers-reduced-transparency` unhandled** — DESIGN.md §3/§5 require
    swapping refraction for the frostier opaque material; neither
    `src/glass/*` nor the rail nor the component queries it (only
    `prefers-reduced-motion` is honoured, correctly).
15. **Component: no accessible name reaches the shadow `<nav>`** —
    `components/ios-tab-bar.js:206` builds `<nav class="bar">` inside the
    shadow root; an `aria-label` set on the host never names it. Reflect
    it into the shadow nav.
16. **Component: dock/minimized targets under 44 px** — dock `.tab` is
    `padding: 4px 10px` + 26 px icon ≈ 34 px tall; minimized bar 48 px −
    padding ≈ 40 px. `min-width: 44px` guards one axis only
    (`components/ios-tab-bar.js:152,157`).
17. **Component: silent icon fallback** — `ICONS[name] || ICONS.grid`
    turns a typo'd icon id into a wrong glyph with no warning.

## 4. What the rail gets right (keep)

- One shared footprint (`--rail-w = --btn + --gap + --pill`): nothing
  travels horizontally; calm re-centring rides `left`, never `transform`,
  so the glass library follows the host without ghosts (ghostAE 0).
- Calm semantics: zero mail melts ONLY the bell, the navigation keeps its
  shape; the melted anchor leaves the tab order and the accessibility
  tree cleanly.
- Fusion without a neck: stacked backdrop-filters at the cap contact, per
  the standing no-neck direction.
- Integer-pixel rest poses; anticipation nudge armed only after the first
  switch flip; reduced-motion collapse; badge count mirrored into the
  bell's `aria-label`; library layers inside the tablist all
  `aria-hidden`; RTL-aware arrow keys + roving tabindex; `guard:glass`,
  `guard:frameworks`, `verify:rail` all green; zero runtime deps.

## 5. Suggested fix order

1. Token + contrast pass (findings 1, 2, 12): link `ios-tokens.css`, add a
   `--ios-badge` red that clears 4.5:1, inactive ink ≥ .78.
2. Targets & edges (3, 4, 5): 44 px tab height, safe-area clamp,
   `min(--rail-w, 100vw - 24px)`.
3. Semantics (6, 15): `aria-current` nav pattern on the rail; reflect the
   component's nav name.
4. Selection lens (9) + symbols (10) from the component, keeping the melt
   choreography intact.
5. Hygiene (7, 8, 11, 13, 14, 16, 17).

Each step is independently verifiable with `npm run review:rail` +
`npm run verify:rail`; none of them touches `src/glass/*`.

## 7. Redesign round — iOS 27 tokens + reference morph (follow-up commit)

The bar was rebuilt per this review and the user's direction: iOS 27 tab-bar
tokens, iOS 27-style symbols on every item, and the melt choreography
replaced by the glass-ui morphing technique (one metaball lens, spring
k=140/c=16, per-frame displacement + specular maps — `src/rail-glass.ts`).
Re-measured with `npm run review:rail`:

| Finding | Resolution | Measured after |
|---|---|---|
| 1 inactive ink 4.41:1 | `--ios-tab-inactive` (.78) via linked tokens | 5.44:1 light / 10.62:1 dark |
| 2 badge 3.46:1 | `--ios-tint-warm` ground + `#241000` ink | 8.89:1 light / 10.22:1 dark |
| 3 targets 33.5px | icon+label items, 56px tall | 56px |
| 4 safe-area | `bottom: calc(clamp(…) + env(safe-area-inset-bottom))` | — |
| 5 320px clip | `min(footprint, 100vw - 20px)` | 31.5px margins at 320 |
| 6 tablist w/o panels | buttons + `aria-current="page"`, one nav label | — |
| 9 selection treatment | tinted symbol+label per DESIGN §4 (no second glass) | `rgb(0,96,214)` / `rgb(108,178,255)` end-dark |
| 10 no symbols | 24px filled SF-Symbol-style glyphs on all four items | 4 svgs |
| 11 physical props | badge on `inset-inline-end`; bell-left kept (user direction) | — |
| 12 hard-coded inks | `@import "../components/ios-tokens.css"` + end-dark column | tokens verified |
| 13 sticky hover | `@media (hover: hover)` | — |
| 14 reduced transparency | tokens' media query feeds the inline frost chain | — |

Morph verification: `verify:rail` — droplet born inside the cap (min gap
−18), clean 10px rest, bell ⌀ 56→0 on close, ghostAE 0, reduced-motion
spring collapses to a two-pose jump; `verify:rail:frames` poses the spring
through `window.railGlass.pose(p)`.

Still open (component scope, not touched here): 7 (`items` innerHTML),
8 (Persian webfont — labels still render in the platform fallback),
15–17 (shadow nav name, dock/minimized targets, silent icon fallback).
