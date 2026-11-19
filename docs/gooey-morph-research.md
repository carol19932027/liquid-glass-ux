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
   `backdrop-filter: blur(2px) saturate(1.2)` plus the host's own surface
   recipe — a white underlay (`rgb(255 255 255 / .3)`) under a specular-ish
   gradient (.3/.12/.24). The first attempts (10–18% *currentColor* tint)
   read as a shadow next to the hosts' white glass and vanished on a real
   display; matching the hosts' white stack is what makes the fused
   silhouette read as one body.
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
(never on load) and gated by `prefers-reduced-motion`. Visibility is pure
geometry; the loop parks itself once the caps have read identical for ~20
frames or the neck has finished fading. Every frame it reads the live cap
rects and works in two regimes:

- **Metaball bridge** — caps apart or nearly: waist
  `w = 48·min(1, max(0, 1 − sep/10))^1.35` with `sep = gap + rise/2`, so the
  waist pinches to zero exactly at the 10px resting gap and both resting
  states stay neckless; the path tucks 26px under each cap so the concave
  fillets flare wide, like the reference's deep pinch, and the seams hide
  under their glass. (A persistent resting neck matching the reference's
  separated state was built once and removed again on user request — the
  neck lives only inside the motion.)
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

On split the sequence reads fused band → stretching ligament → sliver →
pinch; on merge, thread → fusion snap → wet seam sweeping shut. Both
resting states stay neckless, so the ghost diff remains 0.

Verification added to `scripts/verify-rail-geometry.mjs`: per-frame neck
visibility + the caps the driver used (`data-span`), asserting the neck is
hidden in the first/last frames of each direction, visible mid-morph, its
14px tuck exact, its rects live (within a 3-frame window of the recorder's
own reads), the rail and both hosts free of `filter`/`backdrop-filter`, and
the neck never visible under `prefers-reduced-motion`. Latest run: open 20
visible frames, close 15, both resting states neckless (hidden→hidden),
`problems: []`, `ghostAbsoluteErrorPixels: 0`, tabsLeft 625 constant,
cover drift 0.

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

## 8. Addendum 2026-11-17 — the rail is notification-driven

The state machine was re-cut per review: the rail no longer rests as a
labelled pill. `data-state="calm"` (zero notifications) is the tab pill
alone, centred in the shell, in its own shape; `data-state="alert"`
(badge > 0) is the bell button plus the pill, badge on the bell. The
header switch simulates mail arriving (on) and cleared (off) and stays
the only writer.

Geometry of the melt: the bell collapses by `width: 56px -> 0` while
`margin-left: 0 -> 33px` carries its right cap to the pill's left cap,
so the neck's bridge regime sees the cap gap pinch 10px -> 0 instead of
stretching; the pill rides the 33px re-centring on `left` (a layout
property — transforms on glass hosts remain off-limits, §8 of the
how-it-works note), and its glass cover rides with it (cover-tabs drift
stayed 0 across both directions). Because calm parks the melted cap
exactly ON the pill cap (gap 0), the neck driver gained a
`morphVis && mr.width > 1` guard: without it the waist formula reads a
full bridge at the calm rest and the neck would persist there.

Verified: ghostAE 0 (calm pixel-identical across a full alert+calm
cycle), both rests neckless, neck live 16-17 frames per direction with
the 26px tuck holding inside a 3-frame recorder-lag window on BOTH caps
(the pill travels now, so the rig's tabs read lags a tick exactly like
the morph's), cover-tabs drift 0, morph width 0<->56 plus spring
overshoot, badge scale 0<->1 with the bell unfocusable and aria-hidden
in calm.

## 9. Addendum 2026-11-16 — polish pass on the morph transition

$impeccable polish on the navigation morph (engine unavailable in this
sandbox; the pass ran by hand against the frozen frame strips). Defects
the strips showed and what fixed them:

- **Two spines.** The melt ran 0.58s/1.85 and the pill ride 0.54s/1.92;
  the easing mismatch dipped the cap gap negative mid-flight (a
  one-frame full-bridge flash). The ride now shares the melt's duration
  and curve, so gap(t) = 10px * (1 - ease(t)) exactly.
- **Story order.** The badge popped at t=0 on top of an amorphous blob
  and the bell glyph arrived late from open sea. The badge pop is
  delayed to 0.28s (the button exists first); the glyph rides the seam
  both ways — enters from the pill cap (+20px -> 0), and in calm is
  absorbed back into it (+16px) so the melt reads as liquid pouring
  into the navigation, never an empty slab sinking.
- **The slab.** Mid-melt the button is narrower than tall, and the
  glass library's scalar radius clamp leaves straight flanks. The host
  now wears elliptical caps (border-radius: 50% / 28px, !important over
  the library's mount-time inline radius); underlay inherits and the
  cover copies the computed value on every sync pass, so every
  intermediate pose is a liquid egg.
- **The parked sheet.** The 1.85 spring closes the cap gap in ~150ms
  while the bell still has ~3px of width, so the neck's waist parked at
  full height over the pill cap until the visibility flip. The waist is
  now scaled by capPresence (bell width / 24), the bridge only lives
  above 35% cap presence (past that the 26px tuck edge stands exposed
  as a bowtie ghost), and the melt-away fade RETRACTS the last path —
  exposed edge walking to the seam, waist thinning — instead of
  holding it. The dead wet-seam straddle regime (rise is always 0 now)
  is gone with it.
- **States.** The bell glyph carries hover (1.07) and press (0.86)
  since a transform on the glass host is off-limits; the host grows a
  :focus-visible ring.

Verified after the pass: ghostAE 0, both rests neckless, cover-tabs
drift 0, neck live 12-13 frames per direction, 390x844 fits with the
badge intact, zero console errors, tsc/build/guards clean.

## 10. Addendum 2026-11-16 — the "half bell" sheet (user-reported)

Report: mid-animation the bell button looks sliced in half from the
left; guess was overflow hidden. It was not a clip: it was the neck.
The thread's left tuck (26px) and left edge (44px full height) were
sized for the full 56px cap; mid-melt the cap is a ~24px droplet, so
the full-height tuck edge and the fat waist stood out AROUND it as a
square pale sheet — reading as a straight cut through the button's
left half. (Debugging note: isolating layers by visibility override
lies here — the neck driver's rAF re-asserts visibility every frame,
so frozen-pose hide tests never actually hid it; the pixel evidence
only makes sense once the driver is read as the paint owner.)

Fix: the left tuck and left edge now scale with the bell cap —
tuckL = min(26, w*0.45 + 2), eL = 22 * min(1, w/48) — while the right
side stays full (the pill cap never changes size). The thread now
pours from a droplet-sized mouth into the pill cap. The verify span
grew two driver-owned fields (tuckL, morph width) so the rig checks
the tuck against the exact width the driver used, immune to the
one-tick recorder lag; the rig asserts tuckL == 26 at full cap and
min(26, w*0.45+2) below it.

Verified: ghostAE 0, rests neckless, drift 0, 12-14 neck frames per
direction with the scaled tuck holding in every live frame, strips
clean at 60/120ms in both directions.

## 11. Addendum 2026-11-16 — the neck is retired; fusion is optical

User verdict: whatever the thread does, it visibly is not part of the
two elements. So there is no third paint any more: `.rail-neck`, its
driver, its clip-path math and its rig assertions are gone. The morph
now fuses by OPTICAL OVERLAP — the bell's cap rides a few px inside
the pill's cap mid-flight, and two stacked backdrop-filters (bell z2
over pill z0, one-way sampling, safe because reflect:false removed the
overhanging reflection layer) make the junction denser liquid. The
penetration is choreographed to stay in the droplet phase and inside
the pill's 28px cap zone, so no tab is ever occluded:

- melt: width collapses early-middle at the seam, margin-left springs
  ahead with a late overshoot, the pill slides in on a dipping spring;
  contact (-12px) happens once the bell is a droplet — absorption
- emerge: width swells a beat ahead of the margin spring while the
  pill's departure is front-loaded; contact (-18px) while the droplet
  is still small — division
- a wet rim pulse on each host's own edge layers was tried and
  REJECTED: the filled animation left the cover's copied rim custom
  property stuck at a mid value, breaking pixel-identical rests
  (ghostAE 12376). Fusion stays purely geometric+optical.

Rig: neck assertions replaced by gap assertions — caps must
inter-penetrate (min gap < -2), stay shallower than -22 (cap zone),
part to exactly 10px at the alert rest, and the calm rest must show no
bell; reduced-motion asserts no intermediate width (instant flip).

## 12. Addendum 2026-11-16 — the unified one-body rail

User direction: rewrite as ONE integrated piece — the navigation glass
with the notifications button as one of its ITEMS; when mail arrives
the glass visually divides in two, the bell piece morphing out through
the left cap. Implemented:

- calm: a single 290px glass pill; the bell lives inside it as a 44px
  lens inset 4px from the left cap (stacked glass over the body, the
  way the selected-tab lens rides it), glyph at 0.9 scale, badge at
  scale 0. One visible glass body, no seam, no stranger beside it.
- alert: the same body divided — the lens slides out through the left
  cap, grows to 56px and stands at the shell's left with the badge;
  the pill closes to 256px at the right. The crossing is fused by the
  stacked backdrop-filters (bell z2 over pill z0, one-way sampling).
- one spine (0.58s, cubic-bezier(0.3,1.85,0.45,1)) drives piece
  position, piece width, pill position, pill width and the pill's
  inner padding-left (room for the lens in calm, closed in alert, so
  the tabs re-centre in whatever body they have) — the gap between the
  caps is then 10 - 58*ease(t) exactly, monotone by construction.
- the bell is a real item in both states: always linked, always
  focusable; only badge and aria-label change with the mail. The
  visibility flips, the aria-hidden juggling and the nudge animation
  are gone with the old melted-away semantics.
- calm geometry sits on integer pixels (290/16/20/44): at half-pixel
  rests the lens rim's conic mask re-phased between the two calm
  captures and cost 10 ghost pixels.

Rig: lens-inside assertions at the calm rest (inset 2..10, reach
40..60, first tab clear by >=2px), monotone cap-gap through both
directions (settle wiggle exempt), 10px two-piece rest, badge scale
0<->1, reduced-motion no intermediate width. ghostAE 0, drift 0,
guards OK.

## 13. Addendum 2026-11-16 — the metaball lens (reference: glass-ui morphing)

User supplied the reference: jeantimex.github.io/glass-ui/morphing.html —
one lens whose silhouette is a field of two primitives, displacement and
specular maps rasterised into an SVG filter per frame, spring-driven
split. The rail now wears that technique (src/rail-glass.ts):

- the silhouette is the smooth union (polynomial smin, k=6) of the bell
  circle and the pill capsule; the waist, the thread and the snap-off
  FALL OUT of the field — no third paint, no stacked-host trick
- per morph frame the field is rasterised at rail size into three maps:
  silhouette alpha (mask-image of the glass layer), displacement
  (feImage -> feDisplacementMap over the backdrop, edge profile against
  the outward normal, scale 14), and an edge-light band modulated by
  the normal against a top-left key (mask of the rim layer)
- the driver reads the live content rects (bell span, pill span), so
  the CSS choreography stays the single source of motion; it parks
  after 20 settled reads and stays alive while animations are paused
  (the frames rig freezes them)
- k=6 vs the 10px resting gap keeps both rests clean: the thread only
  exists while the surfaces are closer than k, i.e. inside the motion
- wiring mirrors src/glass (read-only reference): backdrop-filter
  url(#rail-refract) set INLINE (the build minifier drops
  backdrop-filter from stylesheets — the library's own reason for
  setting it inline), defs svg parked zero-size out of the flex flow
- the rail hosts are plain content spans now; the bell's item lens at
  calm is an ink pill (::before), the same language as the selected
  tab's lens; the library still owns every other glass on the page

Rig: the lens layer is asserted as the rail's single backdrop root
(with silhouette and rim masks present), shell and content spans
filter-free; gap monotonicity, rests, badge, ghost and PRM checks
unchanged. ghostAE 0, guards OK.
