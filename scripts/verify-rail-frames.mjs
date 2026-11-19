// Rail motion verification: freeze-frame strips of both morph directions.
//
// The morph is a JS spring (src/rail-glass.ts, the glass-ui morphing
// reference's k=140/c=16), so there is no Web Animations timeline to step:
// instead the rig poses the spring deterministically through
// window.railGlass.pose(p) — p is the split parameter, 0 = capsule alone,
// 1 = bell parked at its 10px gap (values past 1 show the spring's
// overshoot splash). Each pose rasterises its own silhouette, displacement
// and specular maps, so every frame of the strip is the real liquid, not an
// interpolation. Real-time timing is what verify-rail-geometry.mjs measures.
//
// Requirements:
//   npm ci                        # installs playwright-core + @sparticuz/chromium
//   npm run build && npm run preview   # :4173 serves dist
//   npm run verify:rail:frames
//
// Frames land in verify-artifacts/ (gitignored).
import { chromium } from "playwright-core";
import sparticuz from "@sparticuz/chromium";
import { brotliDecompressSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const OUT = "verify-artifacts";
const URL = process.env.RAIL_URL ?? "http://127.0.0.1:4173/";
const OPEN = [0, 0.16, 0.34, 0.55, 0.78, 0.95, 1.08, 1];
const CLOSE = [1, 0.85, 0.62, 0.4, 0.2, 0.06, 0];

const LIB = "/tmp/al2023/lib";
if (!fs.existsSync(`${LIB}/libnss3.so`)) {
  const br = "node_modules/@sparticuz/chromium/bin/al2023.tar.br";
  fs.mkdirSync("/tmp/al2023", { recursive: true });
  fs.writeFileSync("/tmp/al2023.tar", brotliDecompressSync(fs.readFileSync(br)));
  execFileSync("tar", ["xf", "/tmp/al2023.tar", "-C", "/tmp/al2023"]);
}
process.env.LD_LIBRARY_PATH = [LIB, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":");

fs.mkdirSync(OUT, { recursive: true });

const exe = await sparticuz.executablePath();
const browser = await chromium.launch({ executablePath: exe, args: [...sparticuz.args, "--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);

const railBox = await page.evaluate(() => {
  const r = document.querySelector(".rail").getBoundingClientRect();
  return {
    x: Math.round(r.x) - 50,
    y: Math.round(r.y) - 50,
    width: Math.round(r.width) + 100,
    height: Math.round(r.height) + 100,
  };
});

const strip = async (name, poses) => {
  for (const [i, p] of poses.entries()) {
    await page.evaluate((pp) => window.railGlass.pose(pp), p);
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${OUT}/fz-${name}-${String(i).padStart(2, "0")}.png`, clip: railBox });
  }
  console.log(name, "strip captured", poses.join(","));
};

await strip("open", OPEN);
await strip("close", CLOSE);
await browser.close();
fs.writeFileSync(`${OUT}/fz-poses.json`, JSON.stringify({ OPEN, CLOSE }));
console.log(
  `frames in ${OUT}/fz-*.png — montage them with:\n` +
    `  montage ${OUT}/fz-open-*.png -tile 2x4 -geometry +3+3 -background '#333' ${OUT}/fz-open-strip.png\n` +
    `  montage ${OUT}/fz-close-*.png -tile 2x4 -geometry +3+3 -background '#333' ${OUT}/fz-close-strip.png`
);
