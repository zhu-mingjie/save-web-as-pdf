import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const outdir = path.join(root, "dist");

await rm(outdir, { recursive: true, force: true });
if (process.argv.includes("--clean")) process.exit(0);

await mkdir(outdir, { recursive: true });

await build({
  entryPoints: {
    "background/service-worker": "src/background/service-worker.ts",
    "popup/popup": "src/popup/popup.ts",
    "page/page-agent": "src/page/page-agent.ts",
    "editor/editor": "src/editor/editor-controller.ts",
    "preview/preview": "src/preview/preview.ts"
  },
  bundle: true,
  format: "esm",
  target: "chrome120",
  outdir,
  sourcemap: true,
  logLevel: "info"
});

await Promise.all([
  cp("manifest.json", path.join(outdir, "manifest.json")),
  cp("src/popup/popup.html", path.join(outdir, "popup/popup.html")),
  cp("src/popup/popup.css", path.join(outdir, "popup/popup.css")),
  cp("src/preview/preview.html", path.join(outdir, "preview/preview.html")),
  cp("src/preview/preview.css", path.join(outdir, "preview/preview.css"))
]);
