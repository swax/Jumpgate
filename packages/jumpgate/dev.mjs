// Dev server for the standalone demo.
//
//   npm run dev                       # empty editor
//   npm run dev -- ../../samples/sample.jg   # preload a .jg file
//
// The optional file path is resolved relative to the current directory, its
// contents are baked into the bundle, and the demo loads it on startup.
import esbuild from "esbuild";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const fileArg = process.argv[2];

// Defaults are the literal `null` so the `define` always replaces the
// identifiers, even when no file is passed.
let initialDoc = "null";
let initialName = "null";

if (fileArg) {
  const fullPath = resolve(process.cwd(), fileArg);
  const content = readFileSync(fullPath, "utf8");
  JSON.parse(content); // fail fast with a clear error if it isn't JSON
  initialDoc = JSON.stringify(content);
  initialName = JSON.stringify(basename(fullPath));
  console.log(`Preloading ${fullPath}`);
}

const ctx = await esbuild.context({
  entryPoints: ["demo/demo.ts"],
  bundle: true,
  outfile: "demo/demo.js",
  format: "iife",
  platform: "browser",
  sourcemap: true,
  define: {
    __INITIAL_DOC__: initialDoc,
    __INITIAL_NAME__: initialName,
  },
});

await ctx.watch();
await ctx.serve({ servedir: "demo", port: 8080 });
console.log("Serving at http://localhost:8080");
