// Runs every *.test.ts in this folder in its own process (in-memory fixtures, no DB).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
let failed = false;
for (const f of fs.readdirSync(here).filter((f) => f.endsWith(".test.ts")).sort()) {
  console.log(`\n# ${f}`);
  try {
    execFileSync(process.execPath, ["--import", "tsx", path.join(here, f)], { stdio: "inherit" });
  } catch {
    failed = true;
  }
}
if (failed) process.exitCode = 1;
