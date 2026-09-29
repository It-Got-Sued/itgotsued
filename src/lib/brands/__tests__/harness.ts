// Minimal test harness for tsx scripts: isolated SQLite DB per run + tiny assertions.
// Run: npx tsx src/lib/brands/__tests__/<file>.test.ts   (or run-all.ts)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const scratch =
  process.env.BRANDS_TEST_DIR ??
  "/private/tmp/claude-501/-Users-kds-Desktop-classactionforme/69eea7e6-5fa3-4f4c-ad04-1f93a526d3d8/scratchpad";
const dir = fs.existsSync(path.dirname(scratch)) ? scratch : os.tmpdir();
// Must be set before getDb() is first called (repo modules open the DB lazily).
process.env.DATABASE_PATH = path.join(dir, `brands-test-${process.pid}-${Date.now()}.db`);

let failures = 0;
let passes = 0;

export function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(
      () => {
        passes++;
        console.log(`  ok  ${name}`);
      },
      (err: unknown) => {
        failures++;
        console.log(`  FAIL ${name}\n       ${err instanceof Error ? err.message : String(err)}`);
      },
    );
}

export function eq<T>(actual: T, expected: T, msg = "") {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg} expected ${e}, got ${a}`);
}

export function ok(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

export function finish(): void {
  console.log(`\n${passes} passed, ${failures} failed`);
  const db = process.env.DATABASE_PATH!;
  for (const f of [db, `${db}-wal`, `${db}-shm`]) fs.rmSync(f, { force: true });
  if (failures) process.exitCode = 1;
}
