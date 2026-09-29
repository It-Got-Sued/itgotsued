// On-demand CourtListener lookup for searches that find nothing in our index (e.g. someone
// pastes a case name from a settlement email). Stores any class actions it finds, then the
// normal search sees them.
import { CourtListenerClient, toCaseRecord, toDocketEntries, type ClSearchPage } from "./courtlistener";
import { applyInferredStatus, mergeDocketEntries, upsertCaseRecord } from "@/lib/repo/ingest";
import { DefendantLinker } from "./link-brands";

const CLASS_SIGNALS =
  '("class action" OR "all others similarly situated" OR "putative class" OR "class settlement" OR cause:"1453")';

// Per-process throttle so a burst of empty searches can't exhaust the API quota.
let lastLookup = 0;
const MIN_GAP_MS = 2_000;

/** Words from the query, minus boolean syntax, for a caseName: search. */
function caseNameTerms(q: string): string | null {
  const words = q
    .replace(/\b(v|vs|et|al|inc|llc|corp|co|the)\b\.?/gi, " ")
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3)
    .slice(0, 6);
  return words.length ? words.join(" AND ") : null;
}

/** Returns the number of cases stored. Never throws; lookups are best-effort. */
export async function lookupAndStoreCases(q: string, limit = 5): Promise<number> {
  const terms = caseNameTerms(q);
  if (!terms || Date.now() - lastLookup < MIN_GAP_MS) return 0;
  lastLookup = Date.now();
  try {
    const client = new CourtListenerClient({
      token: process.env.COURTLISTENER_TOKEN || undefined,
      minIntervalMs: 0,
    });
    const page = await client.get<ClSearchPage>("/search/", {
      type: "r",
      q: `caseName:(${terms}) AND ${CLASS_SIGNALS}`,
      order_by: "dateFiled desc",
    });
    const results = (page.results ?? []).slice(0, limit);
    if (!results.length) return 0;
    const linker = await DefendantLinker.load();
    for (const r of results) {
      const id = await upsertCaseRecord(toCaseRecord(r));
      await mergeDocketEntries(id, toDocketEntries(r.recap_documents ?? []));
      await applyInferredStatus(id);
      await linker.link(id, r.caseName);
    }
    return results.length;
  } catch (err) {
    console.error("[live-lookup] failed:", err instanceof Error ? err.message : err);
    return 0;
  }
}
