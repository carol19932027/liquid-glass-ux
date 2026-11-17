// Rail motion verification: freeze-frame strips of both morph directions.
//
// A headless software rasterizer needs ~0.5s per screenshot, so racing the
// real 600ms morph never lands mid-motion. Instead every animation the
// state flip spawns is paused through the Web Animations API, then
// currentTime is stepped deterministically (0..880ms after the flip) and
// each pose is shot: an exact, repeatable frame strip of the choreography.
// The real-time timing is what scripts/verify-rail-geometry.mjs measures.
//
// Requirements:
//   npm ci                        # installs playwright-core + @sparticuz/chromium
//   npm run preview               # in another terminal (or set RAIL_URL)
//   npm run verify:rail:frames
//
// Frames and montaged strips land in verify-artifacts/ (gitignored); the
// montage step needs ImageMagick and is printed as a hint at the end.
import { chromium } from "playwright-core";
import sparticuz from "@sparticuz/chromium";
import { brotliDecompressSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const OUT = "verify-artifacts";
const URL = process.env.RAIL_URL ?? "http://127.0.0.1:4173/";
const TIMES = [0, 60, 120, 180, 260, 340, 440, 560, 700, 880];

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
const browser = await chromium.launch({
  executablePath: exe,
  args: [...sparticuz.args, "--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
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

const freeze = async (name) => {
  await page.click(".morph-switch");
  await page.evaluate(() => {
    const stop = () =>
      document.getAnimations().forEach((a) => {
        if (a.timeline === document.timeline) a.pause();
      });
    stop();
    requestAnimationFrame(stop); // catch animations spawned a frame late
  });
  for (const [i, t] of TIMES.entries()) {
    await page.evaluate(
      (ms) => {
        document.getAnimations().forEach((a) => {
          if (a.timeline === document.timeline) a.currentTime = ms;
        });
      },
      t
    );
    await page.screenshot({ path: `${OUT}/fz-${name}-${String(i).padStart(2, "0")}.png`, clip: railBox });
  }
  await page.evaluate(() =>
    document.getAnimations().forEach((a) => {
      if (a.timeline === document.timeline) a.play();
    })
  );
  await page.waitForTimeout(1600); // let the (unpaused) morph finish
  console.log(name, "strip captured");
};

await freeze("open");
await freeze("close");
await browser.close();
fs.writeFileSync(`${OUT}/fz-times.json`, JSON.stringify(TIMES));
console.log(
  `frames in ${OUT}/fz-*.png — montage them with:\n` +
    `  montage ${OUT}/fz-open-*.png -tile 2x5 -geometry +3+3 -background '#333' ${OUT}/fz-open-strip.png\n` +
    `  montage ${OUT}/fz-close-*.png -tile 2x5 -geometry +3+3 -background '#333' ${OUT}/fz-close-strip.png`
);
