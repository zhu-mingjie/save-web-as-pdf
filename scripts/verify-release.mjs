import { readFile } from "node:fs/promises";
import path from "node:path";
import { readManifest, validateDist, validateZip } from "./release-utils.mjs";

const root = process.cwd();
const distDirectory = path.join(root, "dist");
const manifest = await readManifest(distDirectory);
await validateDist(distDirectory);
const releasePath = path.join(root, "release", `save-web-as-pdf-v${manifest.version}.zip`);
const entries = validateZip(await readFile(releasePath), manifest.version);
console.log(`Release verification: OK (${entries.length} files)`);
