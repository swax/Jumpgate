// Render a .jg file to a PNG from the command line using headless Chromium.
//
//   npm run render -- ../../samples/sample.jg                # writes sample.png next to the .jg
//   npm run render -- ../../samples/sample.jg out.png        # explicit output path
//   npm run render -- diagram.jg --width 1600 --height 1000 --scale 2 --padding 60
//
// The .jg contents are baked into a one-off esbuild bundle of render/render.ts,
// loaded via page.setContent, fitted to the viewport, and screenshotted.
// Requires Playwright's Chromium: `npx playwright install chromium`.
import esbuild from "esbuild";
import { readFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const opts = { width: 1280, height: 800, scale: 1, padding: 40 };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const m = /^--(width|height|scale|padding)(?:=(.*))?$/.exec(arg);
    if (m) {
      const raw = m[2] ?? argv[++i];
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error(`--${m[1]} expects a positive number, got "${raw}"`);
      }
      opts[m[1]] = n;
    } else if (arg === "--help" || arg === "-h") {
      opts.help = true;
    } else {
      positional.push(arg);
    }
  }
  return { opts, positional };
}

const { opts, positional } = parseArgs(process.argv.slice(2));

if (opts.help || positional.length === 0) {
  console.log(
    "Usage: node render.mjs <file.jg> [out.png] [--width N] [--height N] [--scale N] [--padding N]",
  );
  process.exit(opts.help ? 0 : 1);
}

const inputPath = resolve(process.cwd(), positional[0]);
const outputPath = positional[1]
  ? resolve(process.cwd(), positional[1])
  : join(dirname(inputPath), basename(inputPath, extname(inputPath)) + ".png");

const content = readFileSync(inputPath, "utf8");
JSON.parse(content); // fail fast with a clear error if it isn't JSON

const bundle = await esbuild.build({
  entryPoints: [join(here, "render/render.ts")],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  define: {
    __RENDER_DOC__: JSON.stringify(content),
    __RENDER_PADDING__: String(opts.padding),
  },
});
const script = bundle.outputFiles[0].text;

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({
    viewport: { width: opts.width, height: opts.height },
    deviceScaleFactor: opts.scale,
  });
  page.on("pageerror", (err) => console.error("[page]", err.message));

  await page.setContent(
    `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><script>${script}</script></body></html>`,
  );

  await page.waitForFunction(() => window.__jumpgateReady || window.__jumpgateError, null, {
    timeout: 30_000,
  });
  const error = await page.evaluate(() => window.__jumpgateError);
  if (error) throw new Error(error);

  await page.screenshot({ path: outputPath });
  console.log(`Wrote ${outputPath}`);
} finally {
  await browser.close();
}
