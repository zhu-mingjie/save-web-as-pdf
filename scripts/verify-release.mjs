import { readFile } from "node:fs/promises";
import path from "node:path";
import { readManifest, validateDist, validateZip } from "./release-utils.mjs";

const root = process.cwd();
const distDirectory = path.join(root, "dist");
const manifest = await readManifest(distDirectory);
await validateDist(distDirectory);
const rootFolder = `save-web-as-pdf-v${manifest.version}`;
const releasePath = path.join(root, "release", `${rootFolder}.zip`);
const entries = validateZip(await readFile(releasePath), rootFolder, manifest.version);
console.log(`Release verification: OK (${entries.length} files)`);
