# DESIGN.md — iOS 27 Liquid Glass, web baseline

Baseline: iOS 27 / WWDC 2026 refinements (Liquid Glass kept, refined: an
intensity slider from crystal-clear to fully tinted, darker edges with
brighter highlights for separation, better diffusion of busy content,
uniform toolbars, tab-bar search re-integrated). Captured 2026-11-17 for
this study; the native guidance mirror lives in the impeccable skill's
`reference/ios.md`, the web material anatomy in `HOW-IT-WORKS.md`.

Rule zero, from Apple and kept here: **glass belongs to the control and
navigation layer, never to content.** Lists, cards, photos and page
backgrounds stay solid; bars, buttons, sheets and floating controls float
above them in glass.

## 1. Native component register (iOS 27)

| # | Native component | Layer | Glass variant | Native behaviour worth carrying | Web equivalent |
|---|---|---|---|---|---|
| 1 | Tab bar | navigation | regular, capsule | floats over content; minimizes on scroll-down; 2–5 sections; search re-integrated as a trailing tab in iOS 27; sidebar-adaptable on iPad | `<ios-tab-bar>` |
| 2 | Navigation bar | navigation | regular, edge band | large title collapsing to inline on scroll; scroll-edge effect keeps content legible | `<ios-nav-bar>` |
| 3 | Toolbar | control | regular, edge band | uniform height and item spacing in iOS 27; bottom-anchored actions | `<ios-toolbar>` |
| 4 | Button | control | `.glass` / `.glassProminent` | capsule by default; gel press response; prominent = tinted glass for one primary action | `<ios-button>` |
| 5 | Segmented control | control | regular, one capsule | single glass capsule; the selected segment is a solid thumb inside, not a second glass | `<ios-segmented>` |
| 6 | Switch / slider | control | knob-only, while touched | the knob turns to glass during interaction and settles back | `<ios-switch>` |
| 7 | Sheet / popover | modal | regular surface | half sheets inset from edges; concentric corner radii; swipe to dismiss | `<ios-sheet>` |
| 8 | Search bar / search tab | control | regular, capsule | field inside glass; in iOS 27 also a first-class tab-bar role | `<ios-search-bar>` |
| 9 | Sidebar (iPad/Mac) | navigation | regular, edge-to-edge in iOS 27 | coloured icons, background extension under the pane | deferred |
| 10 | Context menu / action sheet | modal | regular + thick | stacked glass plates, destructive row tinted | deferred |
| 11 | Floating action button | control | regular, circle | sparingly, one per screen, over content | deferred (`<ios-button round>`) |
| 12 | Dock / app icons | shell | thick, layered | sharper layered icons in iOS 27; light catches the surface | out of scope |

## 2. Palette

Semantic system colours, light / dark. Raw hex is documentation only;
components consume the CSS custom properties so both appearances survive.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--ios-label` | `#000000` | `#FFFFFF` | primary text, active symbols |
| `--ios-label-2` | `rgba(60,60,67,0.60)` | `rgba(235,235,245,0.60)` | secondary text, inactive tabs |
| `--ios-label-3` | `rgba(60,60,67,0.30)` | `rgba(235,235,245,0.30)` | placeholders, separators' text |
| `--ios-separator` | `rgba(60,60,67,0.29)` | `rgba(84,84,88,0.65)` | hairlines |
| `--ios-bg` | `#F2F2F7` | `#000000` | grouped background behind bars |
| `--ios-bg-2` | `#FFFFFF` | `#1C1C1E` | cards, sheet surfaces |
| `--ios-tint` | `#007AFF` | `#0A84FF` | the one interactive tint: selection, primary action |
| `--ios-tint-warm` | `#FF9F0A` | `#FF9F0A` | reserved badge/destructive accent |

Glass tints (the wash that makes a pane read as material, not a hole):

| Token | Light | Dark | Applies to |
|---|---|---|---|
| `--ios-glass-tint-clear` | `rgba(255,255,255,0.40)` | `rgba(28,28,32,0.30)` | clear variant over media |
| `--ios-glass-tint-regular` | `rgba(248,248,250,0.66)` | `rgba(34,34,38,0.62)` | regular variant, bars and buttons |
| `--ios-glass-tint-thick` | `rgba(248,248,250,0.80)` | `rgba(44,44,48,0.78)` | sheets, menus, dock |

## 3. Glass surfaces and refraction behaviour

A glass surface is a stack, back to front. Values are the documented
approximation of the system material (the system itself decides on
device; the iOS 27 intensity slider moves between the clear and regular
columns, so both are tokens, not opinions).

| Layer | Regular | Clear | CSS |
|---|---|---|---|
| Refraction (lens rim) | displacement ~18px at the edge, circular profile | 0–8px blur only | `backdrop-filter: … url(#lg-refract)` where supported |
| Frost | `blur(18px) saturate(160%) brightness(1.06) contrast(1.04)` | `blur(4px) saturate(140%)` | `backdrop-filter` chain |
| Tint | `--ios-glass-tint-regular` | `--ios-glass-tint-clear` | `background-color` |
| Specular rim | 1–1.8px, strongest at the top edge, key light 315° | same, softer | inset shadows + 1px border, top weighted |
| Sheen | soft diagonal gloss | none | gradient overlay, screen blend |
| Grain | fine noise, soft-light | none | tiled noise layer |
| Lift shadow | `0 8px 32px rgba(0,0,0,.25)`, adapts to content below | lighter | outer shadow on a sibling, never clipped |

iOS 27 separation rule: **darker edges, brighter highlights** — the rim
shadow side deepens while the specular side brightens, so glass keeps its
silhouette over busy content. Reduce Transparency swaps refraction for a
frostier, more opaque material (never a bare transparent pane); Reduce
Motion removes the gel press and scroll minimization.

Geometry: corner radii are concentric (outer radius = inner radius + gap);
bars are capsules or device-matched rectangles; every target ≥ 44×44 pt;
nothing hard-codes bar heights — safe-area insets own the edges.

## 4. Per-component refraction notes

- **Tab bar:** capsule glass floating above content, regular variant; the
  lens rim wraps the whole capsule, specular enters from the top; on
  scroll-down it minimizes to a compact capsule (symbols only) and returns
  on scroll-up; selected tab = tinted symbol + label in `--ios-tint`,
  inactive in `--ios-label-2`; no glass-on-glass inside the bar.
- **Navigation bar / toolbar:** edge-to-edge regular band; transparent
  while content sits below the scroll edge, then the material fades in
  with a scroll-edge gradient so text stays legible; large title sits in
  the content layer, never in glass.
- **Button:** capsule, regular tint, 1px specular rim; press = gel bulge
  (scale ~0.97 + brightened rim), release springs back; prominent adds
  `--ios-tint` into the tint layer and flips labels to white.
- **Segmented:** one glass capsule; the thumb is a solid `--ios-bg-2`
  capsule sliding inside — solid, not a second glass (glass-on-glass is
  the classic mistake).
- **Switch:** track solid; only the knob borrows glass, and only while a
  pointer is down.
- **Sheet:** thick surface, concentric top radii, grabber in
  `--ios-label-3`; the dimmed backdrop is solid alpha, not glass.
- **Search bar:** capsule regular glass around a solid field inset; the
  field itself is `--ios-bg-2` at 60% so typed text never sits on blur.

## 5. Web component mapping and PWA baseline

- ES modules in `components/`, one file per component, custom elements
  with shadow DOM; no build step, no dependencies — a PWA can import them
  straight from the service-worker cache.
- The material lives in each component's shadow stylesheet, driven by the
  tokens above on `:host`; appearance follows `prefers-color-scheme`,
  intensity follows a `glass-intensity` attribute (clear↔regular, the
  iOS 27 slider), and `prefers-reduced-transparency` swaps refraction for
  the frostier opaque material.
- `backdrop-filter` support matrix: Chromium/Edge/Safari 18+ full chain;
  Firefox gets frost without the SVG displacement (feature-query split);
  no support at all degrades to the solid tint, never to a hole.
- The study's own rail (`src/`, `src/glass/`) is a separate, protected
  artifact: components/ must not import from it, and `src/glass/*` is
  never edited without explicit user approval.

## 6. Motion

Selection and thumb moves: spring ≈ `cubic-bezier(0.3, 1.6, 0.45, 1)`,
250–450 ms; tab-bar minimize follows the scroll velocity, not a timer;
sheet rise 350 ms with the dismissal reversing it; every one of these
collapses to a 1 ms crossfade under Reduce Motion.
