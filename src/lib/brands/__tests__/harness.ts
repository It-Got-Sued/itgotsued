// Minimal test harness for tsx scripts: tiny assertions, no database (fixtures are in memory).
// Run: npx tsx src/lib/brands/__tests__/<file>.test.ts   (or run-all.ts)

let failures = 0;
let passes = 0;
const pending: Promise<void>[] = [];

export function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  const p = Promise.resolve()
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
  pending.push(p);
  return p;
}

export function eq<T>(actual: T, expected: T, msg = "") {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg} expected ${e}, got ${a}`);
}

export function ok(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

/** Waits for every registered test, then prints the tally. */
export async function finish(): Promise<void> {
  await Promise.all(pending);
  console.log(`\n${passes} passed, ${failures} failed`);
  if (failures) process.exitCode = 1;
}
