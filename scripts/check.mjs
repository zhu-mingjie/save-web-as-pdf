import { execFileSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const runNode = (script, args = []) =>
  execFileSync(process.execPath, [path.join(root, script), ...args], { cwd: root, stdio: "inherit" });

runNode(path.join("node_modules", "typescript", "bin", "tsc"), ["--noEmit"]);
runNode(path.join("scripts", "test-filename.mjs"));
runNode(path.join("scripts", "build.mjs"));
