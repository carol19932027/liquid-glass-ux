// The rail's glass, the way jeantimex.github.io/glass-ui/morphing.html does
// it: ONE lens whose silhouette is a field — here the smooth union of the
// bell circle and the tab-pill capsule — with the displacement and specular
// maps rasterised from that field into an SVG filter per morph frame. The
// waist between the two pieces is not painted by a third element and not
// faked by overlapping hosts: it FALLS OUT of the field, so the pinch, the
// thread and the snap-off are the same liquid the rest of the body is.
//
// Wiring mirrors src/glass (read-only reference): a backdrop-filter layer
// carries `backdrop-filter: url(#rail-refract) …`, the filter displaces its
// SourceGraphic (the backdrop snapshot) through an feImage map, and the
// silhouette / edge-light live in mask-image data URLs on two siblings of
// the content — backdrop roots that contain no glass host, the only place
// a filter may live this close to the rail.

const SVG_NS = "http://www.w3.org/2000/svg";

/** Smooth minimum: the liquid blend. k is how close two surfaces may come
    before a waist grows between them; at the 10px resting gap (k = 6) the
    pieces stay clean, and the thread snaps as the gap crosses k. */
const BLEND_K = 6;
const BEZEL = 9; // px of edge band that carries the refraction profile
const DISP_SCALE = 14; // feDisplacementMap scale -> max ~7px of bend
const LIGHT: readonly [number, number] = [Math.cos(-1.05), Math.sin(-1.05)];

type Field = {
  /** signed distance: negative inside the glass */
  d: (x: number, y: number) => number;
  /** outward unit normal */
  n: (x: number, y: number) => [number, number];
};

/** circle | capsule, smoothly unioned */
const makeField = (
  bellX: number,
  bellR: number,
  pillL: number,
  pillR: number,
  h: number
): Field => {
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

export const createRailGlass = (
  rail: HTMLElement,
  read: () => { bellX: number; bellR: number; pillL: number; pillR: number }
) => {
  const W = Math.round(rail.getBoundingClientRect().width);
  const H = Math.round(rail.getBoundingClientRect().height);

  const glass = document.querySelector<HTMLElement>(".rail-glass")!;
  const rim = document.querySelector<HTMLElement>(".rail-rim")!;
  // inline, not stylesheet: the CSS minifier drops backdrop-filter
  const BF = "url(#rail-refract) blur(2px) saturate(1.2)";
  glass.style.backdropFilter = BF;
  glass.style.setProperty("-webkit-backdrop-filter", BF);

  // --- the SVG filter: one feImage displacement map over the backdrop ----
  const defs = document.createElementNS(SVG_NS, "svg");
  defs.setAttribute("class", "rail-defs");
  defs.setAttribute("aria-hidden", "true");
  const filter = document.createElementNS(SVG_NS, "filter");
  filter.setAttribute("id", "rail-refract");
  filter.setAttribute("filterUnits", "userSpaceOnUse");
  filter.setAttribute("color-interpolation-filters", "sRGB");
  filter.setAttribute("x", "0");
  filter.setAttribute("y", "0");
  filter.setAttribute("width", String(W));
  filter.setAttribute("height", String(H));
  const fe = document.createElementNS(SVG_NS, "feImage");
  fe.setAttribute("preserveAspectRatio", "none");
  fe.setAttribute("width", String(W));
  fe.setAttribute("height", String(H));
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

  // --- three canvases: silhouette mask, displacement map, specular mask --
  const canvas = () => {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    return c;
  };
  const silC = canvas();
  const dispC = canvas();
  const specC = canvas();
  const silX = silC.getContext("2d", { willReadFrequently: false })!;
  const dispX = dispC.getContext("2d")!;
  const specX = specC.getContext("2d")!;
  const silI = silX.createImageData(W, H);
  const dispI = dispX.createImageData(W, H);
  const specI = specX.createImageData(W, H);

  const raster = () => {
    const { bellX, bellR, pillL, pillR } = read();
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
        S[i + 3] = (a * 255) | 0;
        S[i] = S[i + 1] = S[i + 2] = 0;
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
        // normal against a top-left key — the rim the body wears while
        // it moves, from its own field
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
  };

  // --- drive it while the bodies move, park when they stand still --------
  let req = 0;
  let still = 0;
  let lastKey = "";
  const frozen = () =>
    document
      .getAnimations()
      .some((a) => a.playState === "paused" && a.timeline === document.timeline);
  const frame = () => {
    req = 0;
    raster();
    const g = read();
    const key = [g.bellX, g.bellR, g.pillL, g.pillR].map((v) => v.toFixed(1)).join();
    still = key === lastKey ? still + 1 : 0;
    lastKey = key;
    if (still < 20 || frozen()) req = requestAnimationFrame(frame);
  };
  const start = () => {
    still = 0;
    if (!req) req = requestAnimationFrame(frame);
  };
  raster();
  return { start };
};
