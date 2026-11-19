// The rail's glass, the way jeantimex.github.io/glass-ui/morphing.html does
// it: ONE lens whose silhouette is a field — the smooth union (polynomial
// smin) of the bell circle and the tab-pill capsule — while a spring
// (Spring(0, 140, 16), the reference's) drives the split parameter and the
// displacement + specular maps are rasterised from that field into an SVG
// filter every morph frame. No CSS choreography: the waist, the thread and
// the snap-off FALL OUT of the field, and the two resting pieces are the
// same liquid as the junction.
//
// Material is iOS 27 (DESIGN.md §2–§3, components/ios-tokens.css): the frost
// chain and tints arrive as token vars inside the inline backdrop-filter,
// the specular rim (top-weighted, key 315°) plus the darker iOS 27 separation
// edge live in the spec map's mask over .rail-rim, and the lift shadow rides
// two proxy capsules UNDER the lens (an outer shadow on siblings, never
// clipped by the mask).
//
// Wiring mirrors src/glass (read-only reference): a backdrop-filter layer
// carries `backdrop-filter: url(#rail-refract) …`, the filter displaces its
// SourceGraphic (the backdrop snapshot) through an feImage map, and the
// silhouette / edge-light live in mask-image data URLs — backdrop roots that
// contain no glass host, the only place a filter may live this close to the
// rail.

const SVG_NS = "http://www.w3.org/2000/svg";

/** Smooth minimum: the liquid blend. k is how close two surfaces may come
    before a waist grows between them; at the 10px resting gap (k = 6) the
    pieces stay clean, and the thread snaps as the gap crosses k. */
const BLEND_K = 6;
const BEZEL = 9; // px of edge band that carries the refraction profile
const DISP_SCALE = 14; // feDisplacementMap scale -> max ~7px of bend
const LIGHT: readonly [number, number] = [Math.cos(-1.05), Math.sin(-1.05)];

/** the reference's spring: stiffness 140, damping 16, unit mass */
const SPRING_K = 140;
const SPRING_C = 16;

type Field = {
  /** signed distance: negative inside the glass */
  d: (x: number, y: number) => number;
  /** outward unit normal */
  n: (x: number, y: number) => [number, number];
};

/** circle | capsule, smoothly unioned */
const makeField = (bellX: number, bellR: number, pillL: number, pillR: number, h: number): Field => {
  const cy = h / 2;
  const cr = Math.max(4, pillR - 28 - (pillL + 28)); // capsule straight run
  const dCircle = (x: number, y: number) => Math.hypot(x - bellX, y - cy) - bellR;
  const dCapsule = (x: number, y: number) => {
    const px = Math.min(Math.max(x, pillL + 28), pillL + 28 + cr);
    return Math.hypot(x - px, y - cy) - 28;
  };
  const d = (x: number, y: number) => {
    const d1 = dCircle(x, y);
    const d2 = dCapsule(x, y);
    const t = Math.min(Math.max(0.5 + (0.5 * (d2 - d1)) / BLEND_K, 0), 1);
    return d2 + (d1 - d2) * t - BLEND_K * t * (1 - t);
  };
  const n = (x: number, y: number): [number, number] => {
    const e = 0.75;
    let gx = d(x + e, y) - d(x - e, y);
    let gy = d(x, y + e) - d(x, y - e);
    const l = Math.hypot(gx, gy) || 1;
    gx /= l;
    gy /= l;
    return [gx, gy];
  };
  return { d, n };
};

export type RailGlass = {
  /** aim the spring at calm (0) or alert (1) */
  setTarget: (t: 0 | 1) => void;
  /** deterministic pose for the frame rig / reduced motion */
  pose: (p: number) => void;
  /** re-measure after viewport or font changes */
  resize: () => void;
};

export const createRailGlass = (rail: HTMLElement, refraction: boolean): RailGlass => {
  const glass = document.querySelector<HTMLElement>(".rail-glass")!;
  const rim = document.querySelector<HTMLElement>(".rail-rim")!;

  // --- the SVG filter: one feImage displacement map over the backdrop ----
  const defs = document.createElementNS(SVG_NS, "svg");
  defs.setAttribute("class", "rail-defs");
  defs.setAttribute("aria-hidden", "true");
  const filter = document.createElementNS(SVG_NS, "filter");
  filter.setAttribute("id", "rail-refract");
  filter.setAttribute("filterUnits", "userSpaceOnUse");
  filter.setAttribute("color-interpolation-filters", "sRGB");
  const fe = document.createElementNS(SVG_NS, "feImage");
  fe.setAttribute("preserveAspectRatio", "none");
  fe.setAttribute("result", "dmap");
  const disp = document.createElementNS(SVG_NS, "feDisplacementMap");
  disp.setAttribute("in", "SourceGraphic");
  disp.setAttribute("in2", "dmap");
  disp.setAttribute("xChannelSelector", "R");
  disp.setAttribute("yChannelSelector", "G");
  disp.setAttribute("scale", String(DISP_SCALE));
  filter.append(fe, disp);
  defs.append(filter);
  rail.prepend(defs);

  // inline, not stylesheet: the CSS minifier drops backdrop-filter. The
  // chain is the iOS 27 regular frost, token-driven, so Reduce Transparency
  // (the tokens' media query) re-frosts it without touching this string.
  const frost =
    "blur(var(--ios-glass-blur)) saturate(var(--ios-glass-saturate)) brightness(var(--ios-glass-brightness)) contrast(var(--ios-glass-contrast))";
  const BF = refraction ? `url(#rail-refract) ${frost}` : frost;
  glass.style.backdropFilter = BF;
  glass.style.setProperty("-webkit-backdrop-filter", BF);

  // --- layout constants, re-read on resize / font swaps ------------------
  let W = 0;
  let H = 0;
  let btn = 56;
  let gap = 10;
  let pillW = 208;
  const measure = () => {
    const cs = getComputedStyle(rail);
    W = Math.round(rail.clientWidth);
    H = Math.round(rail.clientHeight);
    btn = parseFloat(cs.getPropertyValue("--btn")) || 56;
    gap = parseFloat(cs.getPropertyValue("--gap")) || 10;
    pillW = parseFloat(cs.getPropertyValue("--pill-w")) || 208;
    filter.setAttribute("x", "0");
    filter.setAttribute("y", "0");
    filter.setAttribute("width", String(W));
    filter.setAttribute("height", String(H));
    fe.setAttribute("width", String(W));
    fe.setAttribute("height", String(H));
  };

  // --- three canvases: silhouette mask, displacement map, specular mask --
  const silC = document.createElement("canvas");
  const dispC = document.createElement("canvas");
  const specC = document.createElement("canvas");
  const silX = silC.getContext("2d")!;
  const dispX = dispC.getContext("2d")!;
  const specX = specC.getContext("2d")!;
  let silI: ImageData;
  let dispI: ImageData;
  let specI: ImageData;
  const sizeCanvases = () => {
    for (const c of [silC, dispC, specC]) {
      c.width = W;
      c.height = H;
    }
    silI = silX.createImageData(W, H);
    dispI = dispX.createImageData(W, H);
    specI = specX.createImageData(W, H);
  };

  // --- spring-driven geometry: p in [0,1], calm -> alert ------------------
  let p = 0;
  let v = 0;
  let target = 0;
  /** true while the frame rig holds a pose: no integration */
  let held = false;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");

  const geom = (pp: number) => {
    const slotPill = btn + gap; // alert slot, the fixed footprint's right side
    const calmPill = Math.max(0, (W - pillW) / 2); // centred capsule, calm
    const pillL = calmPill + (slotPill - calmPill) * pp;
    const bellR = Math.max(0, pp) * (btn / 2);
    // the droplet is born inside the pill's left cap and rides out of it
    const bellX = pillL + 18 + (btn / 2 - (pillL + 18)) * Math.min(Math.max(pp, 0), 1);
    return { pillL, pillR: pillL + pillW, bellX, bellR };
  };

  const raster = () => {
    const { bellX, bellR, pillL, pillR } = geom(p);
    const field = makeField(bellX, bellR, pillL, pillR, H);
    const S = silI.data;
    const D = dispI.data;
    const P = specI.data;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const dd = field.d(x + 0.5, y + 0.5);
        // silhouette with a 1px antialiased edge
        const a = Math.min(Math.max(0.5 - dd, 0), 1);
        S[i] = S[i + 1] = S[i + 2] = 0;
        S[i + 3] = (a * 255) | 0;
        // displacement: neutral grey outside, edge profile inside; the
        // sample shift runs against the outward normal, so the backdrop
        // magnifies at the rim and sits flat in the body — glass
        const inside = dd < 0;
        const nx = inside ? field.n(x + 0.5, y + 0.5) : ([0, 0] as [number, number]);
        const t = inside ? Math.min(-dd / BEZEL, 1) : 0;
        const e = inside ? Math.pow(1 - t, 1.6) : 0;
        D[i] = 128 - nx[0] * e * 127;
        D[i + 1] = 128 - nx[1] * e * 127;
        D[i + 2] = 128;
        D[i + 3] = 255;
        // edge light: a narrow band on the silhouette, modulated by the
        // normal against the top-left key — the rim the body wears while it
        // moves, from its own field (iOS 27 keeps the bright side; the dark
        // separation edge is the second gradient layer under this mask)
        const band = Math.exp(-((dd / 2.2) ** 2));
        const dir = inside ? Math.max(0, nx[0] * LIGHT[0] + nx[1] * LIGHT[1]) : 0;
        const s = Math.min(255, band * (0.3 + 0.7 * dir ** 1.5) * 255 * 0.9) | 0;
        P[i] = P[i + 1] = P[i + 2] = 255;
        P[i + 3] = s;
      }
    }
    silX.putImageData(silI, 0, 0);
    dispX.putImageData(dispI, 0, 0);
    specX.putImageData(specI, 0, 0);
    fe.setAttribute("href", dispC.toDataURL());
    glass.style.maskImage = `url(${silC.toDataURL()})`;
    glass.style.webkitMaskImage = glass.style.maskImage;
    rim.style.maskImage = `url(${specC.toDataURL()})`;
    rim.style.webkitMaskImage = rim.style.maskImage;

    // content + lift proxies ride the same spring through custom props
    const slotPill = btn + gap;
    const st = rail.style;
    st.setProperty("--pill-dx", `${(geom(p).pillL - slotPill).toFixed(2)}px`);
    st.setProperty("--bell-dx", `${(geom(p).bellX - btn / 2).toFixed(2)}px`);
    st.setProperty("--bell-s", (0.55 + 0.45 * Math.min(Math.max(p, 0), 1)).toFixed(3));
    st.setProperty("--bell-o", Math.min(Math.max(p * 1.6 - 0.25, 0), 1).toFixed(3));
    st.setProperty("--badge-s", Math.min(Math.max((p - 0.55) / 0.45, 0), 1).toFixed(3));
    st.setProperty("--lb-x", `${(geom(p).bellX - geom(p).bellR).toFixed(2)}px`);
    st.setProperty("--lb-d", `${(geom(p).bellR * 2).toFixed(2)}px`);
    st.setProperty("--lp-x", `${geom(p).pillL.toFixed(2)}px`);
    st.setProperty("--lp-w", `${pillW.toFixed(2)}px`);
  };

  // --- drive the spring while it moves, park when it stands still --------
  let req = 0;
  let still = 0;
  let lastKey = "";
  let lastNow = performance.now();
  const frozen = () =>
    document.getAnimations().some((a) => a.playState === "paused" && a.timeline === document.timeline);
  const frame = () => {
    req = 0;
    if (held) {
      // pose held for the frame rig: raster only
    } else if (!reduce.matches) {
      // integrate over WALL time, substepped at 240Hz: a software
      // rasteriser may deliver a morph frame every ~100ms, and the spring
      // must still land in its ~0.7s of real time
      const now = performance.now();
      let el = (now - lastNow) / 1000;
      lastNow = now;
      if (el > 0.25) el = 0.25;
      const n = Math.max(1, Math.ceil(el * 240));
      const dt = el / n;
      for (let i = 0; i < n; i++) {
        v += (-SPRING_K * (p - target) - SPRING_C * v) * dt;
        p += v * dt;
      }
    } else {
      p = target;
      v = 0;
    }
    raster();
    const key = p.toFixed(3);
    still = key === lastKey && Math.abs(v) < 0.001 ? still + 1 : 0;
    lastKey = key;
    if (still < 20 || frozen()) req = requestAnimationFrame(frame);
  };
  const kick = () => {
    still = 0;
    lastNow = performance.now();
    if (!req) req = requestAnimationFrame(frame);
  };

  measure();
  sizeCanvases();
  raster();

  const api: RailGlass = {
    setTarget: (t) => {
      held = false;
      target = t;
      kick();
    },
    pose: (pp) => {
      held = true;
      p = pp;
      v = 0;
      target = pp <= 0.5 ? 0 : 1;
      raster();
      kick();
    },
    resize: () => {
      measure();
      sizeCanvases();
      kick();
    },
  };
  return api;
};
