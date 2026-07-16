import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outdir = resolve(root, "dist");
await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

await build({
  entryPoints: [
    resolve(root, "src/background/index.ts"),
    resolve(root, "src/popup/index.ts")
  ],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "chrome120",
  outbase: resolve(root, "src"),
  outdir,
  sourcemap: true
});
await build({
  entryPoints: [resolve(root, "src/content/index.ts")],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "chrome120",
  outbase: resolve(root, "src"),
  outdir,
  sourcemap: true
});

await cp(resolve(root, "manifest.json"), resolve(outdir, "manifest.json"));
await mkdir(resolve(outdir, "popup"), { recursive: true });
await cp(resolve(root, "src/popup/index.html"), resolve(outdir, "popup/index.html"));
await cp(resolve(root, "src/popup/styles.css"), resolve(outdir, "popup/styles.css"));
