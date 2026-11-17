# Gooey glass morph — research: bell ↔ tab bar as one liquid

Status: research only, no code changed. 2026-11-17, branch `arena/fe338599-liquid-glass-ux`.
Question: how can the notification button and the navigation pill split/merge
with a *gooey* liquid-glass read — two pieces connected by a sticky bridge that
stretches and pinches off — without breaking the refraction library?

## 1. How the gooey effect works (prior art)

- The canonical technique is a two-primitive SVG filter: `feGaussianBlur`
  melts neighbouring alpha halos together, then `feColorMatrix` cranks the
  alpha contrast (the usual row is `0 0 0 18 -7`, or ×22 −10) so the blurred
  overlap snaps back into one crisp merged silhouette — the metaball
  illusion [1][2][3].
- Discipline that every shipped example repeats: the filter goes on a
  **dedicated silhouette layer only**; icons/content ride the same motion in
  a separate *unfiltered* layer or they smear into the goo; keep the
  filtered group small (blur is GPU-hungry); keep the filter SVG in the same
  document or Safari will not resolve it [3].
- The pure-CSS variant `filter: blur(…) contrast(…)` needs an **opaque
  background** — it fails on a transparent canvas, and the mix-blend-mode
  workarounds are hacks [4]. Our canvas is the page itself, so this variant
  is dead on arrival here.
- CSS `d: path()` transitions (matching command structure) interpolate in
  Chromium and Firefox but **not in Safari**, which does not support `d` as
  a style at all — cross-browser path morphing means per-frame JS/WAAPI, or
  accepting a graceful absence [5][6].

## 2. Hard constraints from the glass library (HOW-IT-WORKS.md)

- An element with `backdrop-filter` is a *backdrop root*: its children see
  only it as their backdrop, not the page (§2).
- Pitfalls, verbatim: "**Backdrop roots on ancestors.** `filter`,
  `opacity < 1`, `mask`, `clip-path`, `mix-blend-mode` other than normal,
  and `will-change`" on an ancestor of a host; "`isolation: isolate` on the
  host does the same"; "`overflow: hidden` on the host or an ancestor clips
  the reflection overhang".
- §8: never animate `transform: scale` on the glass or any ancestor; move
  glass with layout properties (the library's `follow()` pass tracks those).
- Consequence: `filter: url(#goo)` on `.rail` — or on any wrapper around the
  two hosts — is **forbidden outright**. It is exactly the backdrop-root
  family that caused the rail blink bug. The goo must live *outside the
  hosts' ancestor chain*: a sibling layer, or a self-filtered decorative
  element that contains no glass.

## 3. Candidate techniques

| # | Technique | Verdict |
|---|-----------|---------|
| A | **Metaball silhouette layer**: sibling fixed layer holding two blobs that track the hosts' rects, `filter:url(#goo)` on that layer only; tinted, or with its own backdrop-filter (legal: no glass host inside it). Tracking per-frame rAF during the morph, or CSS anchor positioning (Chromium) with rAF fallback. | Viable as a *halo* behind/around the glass; silhouette must match the hosts' rounded caps or it reads as a sticker. |
| B | **Geometric liquid neck** (recommended core): an SVG catenoid bridge between the bell's right cap and the pill's left cap, painted *under* both hosts so the seams hide under their glass. Half-height `h(d) = H·max(0, 1−d/D)^p` (metaball falloff, p≈1.6); `d` attribute rewritten per frame by rAF **only while the morph runs** (paint-only, no layout, no transform on hosts). Cross-browser by construction. Styled with the same tint/edge gradients as the covers; no backdrop-filter by default. | Recommended. |
| C | `blur()+contrast()` chip | Rejected: needs an opaque background [4]. |
| D | `mask`/`clip-path` liquid silhouette on the rail | Rejected: backdrop root on ancestors. |
| E | Canvas/WebGL metaballs | Rejected: the demo's brand is "Pure CSS, no WebGL"; per-frame cost. |
| F | `feTurbulence`+`feDisplacementMap` edge wobble on the neck itself | Optional garnish; self-filter only; off under reduced motion. |
| G | Spring shape continuity alone (today's morph, Dynamic-Island-like) | The baseline the neck builds on, not a replacement. |

## 4. Recommended architecture (B, optionally + A and F)

- **Markup**: `<svg class="rail-neck" aria-hidden="true">` as the *first
  child* of `.rail` — a sibling of the hosts, never an ancestor.
  `position:absolute; inset:0; pointer-events:none; z-index:0`, i.e. under
  the morph host (z2) and its cover, so both caps overlap the neck's ends
  and the bridge appears to grow out of the two pieces.
- **Visibility window**: same discipline as the tab pill — the neck exists
  only while `0 < d < D` during a morph; a delayed `visibility` flip hides
  it exactly when the pinch completes, instant on re-form. At rest in
  either state the neck is hidden, so resting frames stay pixel-identical
  (the ghost-diff assertion keeps passing).
- **Driver**: on `data-state` flip (with `.rail-armed`), one rAF loop until
  the hosts stand still (two identical rect reads, the library's own trick):
  `d = tabsRect.left − morphRect.right` from `getBoundingClientRect()`
  (includes the nudge translate, so the neck follows the *truth*, not a
  parallel clock), then set the path. ~40 lines, runs ~600ms per morph.
- **Path**: `M x1,yM−h C … x2,yM−h L x2,yM+h C … x1,yM+h Z` with control
  points pulled toward the caps for the concave catenoid pinch.
- **Reduced motion**: skip the loop entirely; states flip instantly.
- **Compliance**: no filter/mask/opacity/will-change on hosts or ancestors;
  no transform on hosts; per-frame work is paint-only and time-boxed; ink
  still switches in one step (§6).
- **Fallback**: no rAF/SVG support → the neck simply never appears, which is
  today's morph. Graceful by construction.

## 5. Verification plan (existing rig)

- `npm run verify:rail` + a neck probe: while visible, the neck bbox must
  span `morph.right … tabs.left` within ±2px each frame; hidden outside the
  window; all existing assertions unchanged (tab-pill left constant, cover
  drift 0, ghost AE 0, no console errors).
- `npm run verify:rail:frames`: freeze frames at `d ≈ D·{0.8, 0.5, 0.25}`
  must show stretch → thinning → pinch-off on open, and the bridge swelling
  shut on close.
- Computed-style assertion: no `filter` on `.rail` or either host, at rest
  and mid-morph.
- The real-device pass (GPU compositing, blink) stays with the user;
  headless hides compositor bugs.

## 6. Design decisions (asked 2026-11-17, answered by the user)

1. **Neck material** — *real glass*: the neck carries its own
   `backdrop-filter: blur(3px) saturate(1.3)` plus an 18% currentColor tint
   (raised from 2px/10% after a real-display pass found the first recipe
   too subtle to read in a ~200ms window).
   It is a third backdrop root, but only while the morph runs, and it
   contains no glass host — the one place a filter may live this close to
   the rail. Blink re-checked headlessly (`hostFiltersClean` in the rig);
   a real-display pass is still worth doing once.
2. **Halo** — *none*: no metaball silhouette layer around the glass.
3. **Wobble** — *off*: no turbulence edge wobble.
4. **Merge accent** — *continuous*: the bridge swells until the caps meet;
   no splash overshoot.

## 7. As built (branch arena/fe338599-liquid-glass-ux)

Markup: `<div class="rail-neck" aria-hidden="true">` as the **first child**
of `.rail` — a sibling of both hosts, never an ancestor. CSS: absolute,
`inset:0`, `z-index:0`, `pointer-events:none`, `visibility:hidden` at rest.

Driver (`src/main.ts`, `neckFrame`): started by the switch's `change` event
(never on load), gated by `prefers-reduced-motion`, and self-stopping — it
runs only while a run window (`NECK_LIFE`) is open, while frozen for the
verify rig, or while the neck is visible. Every frame it reads the live cap
rects and works in two regimes:

- **Metaball bridge** — caps apart or nearly: waist
  `w = 48·min(1, max(0, 1 − sep/10))^1.35` with `sep = gap + rise/2`, so the
  waist pinches to zero exactly at the 10px resting gap; the path tucks
  14px under each cap so the seams hide under their glass.
- **Melt-away** — once the geometry says hide, the last path is held and
  faded over 140ms (opacity on the neck only — a sibling, never a host), so
  the thread is seen dissolving into the caps instead of blinking out.
- **Support guard** — `startNeck` returns early unless
  `CSS.supports("clip-path", path(...))`; without clip-path the neck would
  paint as a full-rail fog rectangle, so unsupported browsers keep today's
  morph exactly.
- **Wet seam** — caps overlapping: the junction is the vertical seam where
  the morph's right cap sweeps across the tab pill, so the neck straddles
  `morph.right ± 14` at full height (the fused liquid body) from the fusion
  snap until the morph has swallowed the pill or the tab parks away
  (`rise ≤ 1.5`, seam outside the tab span, or the tab `visibility:hidden`).

On split the sequence reads fused band → ligament → sliver → pinch
(~230ms); on merge, thread → fusion snap → wet seam sweeping shut (~120ms).
Both resting states stay neckless, so the ghost diff remains 0.

Verification added to `scripts/verify-rail-geometry.mjs`: per-frame neck
visibility + the caps the driver used (`data-span`), asserting the neck is
hidden in the first/last frames of each direction, visible mid-morph, its
14px tuck exact, its rects live (within a 3-frame window of the recorder's
own reads), the rail and both hosts free of `filter`/`backdrop-filter`, and
the neck never visible under `prefers-reduced-motion`. Latest run: open 22
visible frames, close 15, `problems: []`, `ghostAbsoluteErrorPixels: 0`,
tabsLeft 625 constant, cover drift 0.

Reading the effect on the live site: the neck exists only *inside* the
morph — flip the "Morph" switch in the page header (next to the logo) and
watch the seam between the bell and the tab pill; both resting states are
deliberately neckless, so a page that is merely loaded or hovered never
shows it.

## References

1. https://freefrontend.com/javascript-gooey/ — gooey effects roundup; the
   alpha-contrast matrix and the "decorative layer only" rule.
2. https://design.solhun.com/en/effects/gooey-effect/ — blur + alpha
   contrast explained; `filter: url(#goo)` on the container.
3. https://codefronts.com/navigation/css-circular-menus/svg-gooey-circular-navigation-menu/
   — two-layer discipline (filtered blobs, clean icons), same-document
   filter for Safari, keep the goo group small.
4. https://www.reddit.com/r/HTML/comments/1asluyl/i_need_help_with_a_metaballs_effect/
   — blur+contrast fails on transparent backgrounds.
5. https://motion.dev/docs/svg-animation — `d: path()` transitions; Safari
   does not support `d` as a style.
6. https://better-design.com/principles/ui/svg-animation — matching command
   structure requirement; Chromium/Firefox only for CSS `d`.
