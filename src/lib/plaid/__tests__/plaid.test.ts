// Run: npx tsx src/lib/plaid/__tests__/plaid.test.ts
// Offline tests: mapping, sync polling, item removal, link-token request shape.

import assert from "node:assert/strict";
import { transactionsToDetections, cleanRawName, brandKey } from "../detections";
import { fetchTransactionSignals, type TransactionsClient } from "../fetch-transactions";
import { runBankScan, type ScanClient } from "../scan";
import { buildLinkTokenRequest } from "../link-token";
import { BankScanError, type PlaidConfig } from "../client";
import { FIXTURE } from "./fixture";

const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

// ---------- mapping ----------
test("maps fixture to unique brand detections", () => {
  const d = transactionsToDetections(FIXTURE);
  const brands = d.map((x) => x.brand);
  assert.deepEqual(
    [...brands].sort(),
    ["Amazon", "Blue Bottle Coffee", "Chipotle", "DoorDash", "Netflix", "Peloton", "Spotify", "Verizon"].sort(),
  );
  for (const x of d) {
    assert.equal(x.source, "bank");
    assert.ok(x.confidence > 0 && x.confidence <= 1);
    assert.deepEqual(Object.keys(x).sort().filter((k) => !["brand", "category", "confidence", "source"].includes(k)), []);
  }
  // Most-purchased first; count raises confidence.
  assert.equal(d[0].brand, "Netflix");
  const by = Object.fromEntries(d.map((x) => [x.brand, x]));
  assert.ok(by.Netflix.confidence > by.Spotify.confidence);
  assert.equal(by.Netflix.category, "tv and movies");
  assert.equal(by.Amazon.category, "online marketplaces");
  assert.equal(by.Verizon.category, "telephone");
  assert.ok(by["Blue Bottle Coffee"].confidence < 0.5, "raw-name fallback is low confidence");
});

test("output leaks no amounts, dates, ids, or accounts", () => {
  const s = JSON.stringify(transactionsToDetections(FIXTURE));
  for (const needle of ["15.49", "2026-03", "acc_fake", "txn_", "ent_", "USD", "JOHN SMITH", "Acme", "Oakwood", "IRS", "Venmo", "Zelle", "Cash App", "Chase", "PayPal"]) {
    assert.ok(!s.includes(needle), `leaked ${needle}`);
  }
});

test("pending superseded by posted counts once", () => {
  const pel = FIXTURE.filter((t) => t.merchant_name === "Peloton");
  const one = transactionsToDetections([pel[1]])[0];
  const both = transactionsToDetections(pel)[0];
  assert.equal(one.confidence, both.confidence);
});

test("raw name cleaning and brand keys", () => {
  assert.equal(cleanRawName("SQ *BLUE BOTTLE COFFEE 0423 CA"), "Blue Bottle Coffee");
  assert.equal(cleanRawName("POS 12345"), null);
  assert.equal(brandKey("Amazon.com, Inc."), brandKey("AMAZON"));
});

// ---------- sync polling ----------
function fakeSync(script: Array<Record<string, unknown> | Error>): TransactionsClient & { calls: (string | undefined)[] } {
  const calls: (string | undefined)[] = [];
  return {
    calls,
    transactionsSync: (async (req: { cursor?: string }) => {
      calls.push(req.cursor);
      const step = script.shift();
      if (!step) throw new Error("script exhausted");
      if (step instanceof Error) throw step;
      return { data: step };
    }) as unknown as TransactionsClient["transactionsSync"],
    transactionsGet: (async () => {
      const e = Object.assign(new Error("x"), { response: { data: { error_code: "PRODUCT_NOT_READY" } } });
      throw e;
    }) as unknown as TransactionsClient["transactionsGet"],
  };
}
const page = (added: unknown[], status: string, next: string, has_more = false, removed: unknown[] = []) => ({
  added, modified: [], removed, next_cursor: next, has_more, transactions_update_status: status, accounts: [], request_id: "r",
});
const fakeClock = () => {
  let t = 0;
  return { now: () => t, sleep: async (ms: number) => void (t += ms) };
};

test("polls NOT_READY -> INITIAL -> HISTORICAL, pages, handles mutation + removed", async () => {
  const [a, b, c, d] = FIXTURE;
  const mutation = Object.assign(new Error("m"), {
    response: { data: { error_code: "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION" } },
  });
  const client = fakeSync([
    page([], "NOT_READY", "c1"),
    page([a], "INITIAL_UPDATE_COMPLETE", "c2"),
    page([b], "HISTORICAL_UPDATE_COMPLETE", "c3", true), // page 1 of run starting at c2
    mutation, // restart run from c2
    page([b], "HISTORICAL_UPDATE_COMPLETE", "c3", true),
    page([c, d], "HISTORICAL_UPDATE_COMPLETE", "c4", false, [{ transaction_id: d.transaction_id }]),
  ]);
  const clock = fakeClock();
  const signals = await fetchTransactionSignals(client, "access-sandbox-x", clock);
  assert.deepEqual(client.calls, [undefined, "c1", "c2", "c3", "c2", "c3"]);
  assert.deepEqual([...signals.keys()].sort(), [a, b, c].map((t) => t.transaction_id).sort());
  const sig = signals.get(a.transaction_id)!;
  assert.ok(!("amount" in sig) && !("date" in sig) && !("account_id" in sig), "signals hold no amount/date/account");
});

test("times out after ~30s of NOT_READY and reports 504", async () => {
  const script = Array.from({ length: 100 }, (_, i) => page([], "NOT_READY", `c${i}`));
  const clock = fakeClock();
  await assert.rejects(
    fetchTransactionSignals(fakeSync(script), "access-sandbox-x", clock),
    (e: unknown) => e instanceof BankScanError && e.status === 504,
  );
  assert.ok(clock.now() <= 30_000);
});

// ---------- scan lifecycle ----------
function fakeScanClient(opts: { failSync?: boolean }) {
  const removed: string[] = [];
  const base = fakeSync(opts.failSync ? [new Error("boom")] : [page(FIXTURE, "HISTORICAL_UPDATE_COMPLETE", "c1")]);
  const client: ScanClient = {
    ...base,
    itemPublicTokenExchange: (async () => ({ data: { access_token: "access-sandbox-abc", item_id: "item1" } })) as unknown as ScanClient["itemPublicTokenExchange"],
    itemRemove: (async (req: { access_token: string }) => {
      removed.push(req.access_token);
      return { data: { request_id: "r" } };
    }) as unknown as ScanClient["itemRemove"],
  };
  return { client, removed };
}

test("scan returns detections and removes the item", async () => {
  const { client, removed } = fakeScanClient({});
  const d = await runBankScan(client, "public-sandbox-123");
  assert.equal(d.length, 8);
  assert.deepEqual(removed, ["access-sandbox-abc"]);
});

test("scan removes the item even when fetching fails", async () => {
  const { client, removed } = fakeScanClient({ failSync: true });
  await assert.rejects(runBankScan(client, "public-sandbox-123"), BankScanError);
  assert.deepEqual(removed, ["access-sandbox-abc"]);
});

// ---------- link token ----------
test("link token request per platform", () => {
  const cfg: PlaidConfig = {
    clientId: "c", secret: "s", env: "sandbox",
    redirectUri: "https://classactionforme.com/plaid/oauth", androidPackageName: "com.classactionforme.app",
  };
  const ios = buildLinkTokenRequest(cfg, "ios");
  assert.equal(ios.redirect_uri, cfg.redirectUri);
  assert.equal(ios.android_package_name, undefined);
  assert.deepEqual(ios.products, ["transactions"]);
  assert.deepEqual(ios.country_codes, ["US"]);
  assert.equal(ios.transactions?.days_requested, 730);
  const android = buildLinkTokenRequest(cfg, "android");
  assert.equal(android.redirect_uri, undefined);
  assert.equal(android.android_package_name, cfg.androidPackageName);
  const a = buildLinkTokenRequest(cfg, "web").user!.client_user_id;
  const b = buildLinkTokenRequest(cfg, "web").user!.client_user_id;
  assert.notEqual(a, b);
  assert.match(a, /^[0-9a-f-]{36}$/);
});

(async () => {
  let failed = 0;
  for (const [name, fn] of tests) {
    try {
      await fn();
      console.log(`ok   ${name}`);
    } catch (e) {
      failed++;
      console.log(`FAIL ${name}\n     ${(e as Error).message}`);
    }
  }
  console.log(`\n${tests.length - failed}/${tests.length} passed`);
  if (failed) process.exit(1);
})();
