// Pull federal class action dockets from CourtListener (RECAP) into the cases table.
//
//   npm run ingest -- --limit 50 --since 2026-01-01
//
// Flags:
//   --limit N          max dockets to upsert (default 25)
//   --since DATE       only dockets filed on/after DATE (YYYY-MM-DD); --since-days N for "N days ago"
//   --before DATE      only dockets filed on/before DATE
//   --nos 370,371      nature-of-suit codes (default: consumer set 190/370/371/380/385/480/485/890)
//   --all-nos          every nature of suit, not just the consumer set
//   --settlement-since DATE  class settlements with court activity since DATE, any filing year
//   --query "..."      override the search query entirely
//   --details          fetch full docket entries + cover-sheet class action flag
//                      (default on when COURTLISTENER_TOKEN is set; --no-details to skip)
//   --require-cover-sheet  with --details, skip dockets whose FJC IDB class_action flag is false
//   --delay-ms N       minimum spacing between API requests (default 1500)
//   --fixture PATH     read a recorded search response instead of calling the API
//   --dry-run          print what would be stored; no DB writes
//   --concurrency N    dockets stored in parallel (default 5)
//
// Idempotent: cases upsert on (source='courtlistener', source_id=docket id); docket entries
// are merged, never duplicated; enriched fields (summary, status, brands) are preserved.
import { parseArgs } from "./_env";
import fs from "node:fs";
import {
  buildClassActionQuery,
  buildSettlementActivityQuery,
  ClHttpError,
  CONSUMER_NOS,
  CourtListenerClient,
  fromDocketEntriesApi,
  toCaseRecord,
  toDocketEntries,
  type ClSearchDocket,
  type ClSearchPage,
} from "@/lib/ingest/courtlistener";
import { applyInferredStatus, mergeDocketEntries, startIngestRun, upsertCaseRecord } from "@/lib/repo/ingest";
import { closePool } from "@/lib/db";

const args = parseArgs();
// --since-days N / --settlement-since-days N: relative dates for scheduled refreshes.
const daysAgo = (n: unknown) => new Date(Date.now() - Number(n) * 86_400_000).toISOString().slice(0, 10);
if (args["since-days"] !== undefined) args.since = daysAgo(args["since-days"]);
if (args["settlement-since-days"] !== undefined) args["settlement-since"] = daysAgo(args["settlement-since-days"]);
const limit = Math.max(1, Number(args.limit ?? 25));
const token = process.env.COURTLISTENER_TOKEN || undefined;
const dryRun = Boolean(args["dry-run"]);
const details = args["no-details"] ? false : args.details ? true : Boolean(token);
const requireCoverSheet = Boolean(args["require-cover-sheet"]);
const nos = typeof args.nos === "string" ? args.nos.split(",").map((s) => s.trim()) : CONSUMER_NOS;
const log = (m: string) => console.log(m);

const client = new CourtListenerClient({
  token,
  minIntervalMs: Number(args["delay-ms"] ?? 1500),
  log,
});

async function* searchPages(): AsyncGenerator<ClSearchPage> {
  if (typeof args.fixture === "string") {
    const data = JSON.parse(fs.readFileSync(args.fixture, "utf8"));
    for (const page of Array.isArray(data) ? data : [data]) yield page as ClSearchPage;
    return;
  }
  const params: Record<string, string> = {
    q:
      typeof args.query === "string"
        ? args.query
        : typeof args["settlement-since"] === "string"
          ? buildSettlementActivityQuery(args["settlement-since"])
          : buildClassActionQuery(args["all-nos"] ? null : nos),
    order_by: "dateFiled desc",
  };
  if (typeof args.since === "string") params.filed_after = args.since;
  if (typeof args.before === "string") params.filed_before = args.before;
  let page = await client.search(params);
  if (page.count != null) log(`CourtListener reports ~${page.count} matching dockets`);
  yield page;
  while (page.next) {
    page = await client.get<ClSearchPage>(page.next);
    yield page;
  }
}

let detailsDisabledReason: string | null = null;

async function fetchDetails(r: ClSearchDocket) {
  if (!details || detailsDisabledReason) return null;
  try {
    const docket = await client.docket(r.docket_id);
    const idb = docket.idb_data as Record<string, unknown> | null | undefined;
    const classActionFlag =
      idb && typeof idb.class_action === "boolean" ? (idb.class_action as boolean) : null;
    const de = await client.docketEntries(r.docket_id);
    return { classActionFlag, ...fromDocketEntriesApi(de.results ?? []) };
  } catch (err) {
    if (err instanceof ClHttpError && (err.status === 401 || err.status === 403)) {
      detailsDisabledReason = `HTTP ${err.status}`;
      log(`  docket details unavailable (${detailsDisabledReason}); using search results only`);
      return null;
    }
    throw err;
  }
}

async function main() {
  log(
    `Ingesting up to ${limit} dockets (token: ${token ? "yes" : "no"}, details: ${details}, dry-run: ${dryRun})`,
  );
  const finishRun = dryRun ? null : await startIngestRun("ingest", "courtlistener", args);
  const seen = new Set<number>();
  let stored = 0;
  let skipped = 0;
  let entriesAdded = 0;

  const CONCURRENCY = Math.max(1, Number(args.concurrency ?? 5));

  async function store(r: ClSearchDocket) {
    const extra = await fetchDetails(r);
    if (requireCoverSheet && extra?.classActionFlag === false) {
      skipped++;
      log(`  skip ${r.docket_id} ${r.caseName} (cover sheet: not a class action)`);
      return;
    }
    const docs = [...(r.recap_documents ?? []), ...(extra?.docs ?? [])];
    const entries = [...toDocketEntries(r.recap_documents ?? []), ...(extra?.entries ?? [])];
    const record = toCaseRecord(r, docs);
    if (dryRun) {
      log(`  [dry] ${record.id} ${record.dateFiled} ${record.caseName} | ${record.natureOfSuit} | complaint: ${record.complaintUrl ?? "-"} | entries: ${entries.length}`);
      return;
    }
    const id = await upsertCaseRecord(record);
    entriesAdded += await mergeDocketEntries(id, entries);
    const moved = await applyInferredStatus(id);
    log(`  ${id} ${record.dateFiled} ${record.caseName}${moved ? `  [${moved}]` : ""}`);
  }

  outer: for await (const page of searchPages()) {
    const batch: ClSearchDocket[] = [];
    for (const r of page.results ?? []) {
      if (stored + batch.length >= limit) break;
      if (seen.has(r.docket_id)) continue;
      seen.add(r.docket_id);
      batch.push(r);
    }
    // Database writes run a few at a time; CourtListener detail calls stay paced by the client.
    for (let i = 0; i < batch.length; i += CONCURRENCY) {
      await Promise.all(batch.slice(i, i + CONCURRENCY).map(store));
    }
    stored += batch.length;
    if (stored >= limit) break outer;
  }
  await finishRun?.({ casesUpserted: stored, entriesAdded });
  log(
    `Done: ${stored} dockets ${dryRun ? "found" : "upserted"}, ${skipped} skipped, ${entriesAdded} new docket entries, ${client.requests} API requests.`,
  );
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(closePool);
