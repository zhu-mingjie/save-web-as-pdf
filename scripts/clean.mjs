import { rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
await Promise.all([
  rm(path.join(root, "dist"), { recursive: true, force: true }),
  rm(path.join(root, "release"), { recursive: true, force: true })
]);
