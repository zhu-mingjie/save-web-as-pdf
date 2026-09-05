import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createZip, validateDist, validateZip } from "./release-utils.mjs";

const root = process.cwd();
const runNode = (script) =>
  execFileSync(process.execPath, [path.join(root, script)], { cwd: root, stdio: "inherit" });

runNode(path.join("scripts", "clean.mjs"));
runNode(path.join("scripts", "test-filename.mjs"));
runNode(path.join("scripts", "build.mjs"));

const distDirectory = path.join(root, "dist");
const { manifest } = await validateDist(distDirectory);
const releaseDirectory = path.join(root, "release");
const releasePath = path.join(releaseDirectory, `save-web-as-pdf-v${manifest.version}.zip`);
await mkdir(releaseDirectory, { recursive: true });
const archive = await createZip(distDirectory);
await writeFile(releasePath, archive);
validateZip(await readFile(releasePath), manifest.version);
console.log(`Release package: ${path.relative(root, releasePath)}`);
