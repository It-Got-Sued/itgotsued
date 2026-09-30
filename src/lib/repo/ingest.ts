// Write-side helpers for ingestion, enrichment and seeding. Additive to cases.ts/brands.ts.
import { query, queryOne } from "@/lib/db";
import type { Brand, CaseStatus, DocketEntry, ProofOfPurchase } from "@/lib/types";
import { toBrand } from "./brands";

type Row = Record<string, unknown>;

export interface CaseUpsertInput {
  id: string;
  source: string;
  sourceId: string;
  sourceUrl?: string | null;
  caseName: string;
  court: string;
  courtId?: string | null;
  docketNumber?: string | null;
  dateFiled?: string | null;
  dateTerminated?: string | null;
  /** Used on insert only; an existing row keeps its (possibly enriched) status. */
  status?: CaseStatus;
  natureOfSuit?: string | null;
  cause?: string | null;
  complaintUrl?: string | null;
  isSample?: boolean;
}

const knownCourts = new Set<string>();

/** Make sure a court row exists so cases can reference it. */
export async function ensureCourt(id: string, name: string): Promise<void> {
  if (knownCourts.has(id)) return;
  knownCourts.add(id);
  await query(
    `INSERT INTO courts (id, name) VALUES ($1, $2)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
    [id, name],
  );
}

/**
 * Insert a case or refresh its docket metadata. Idempotent on (source, source_id).
 * Enriched fields (status, summary, who_qualifies, states, categories, claim_*) are never
 * overwritten here. Returns the stable case id (the existing one when the row already existed).
 */
export async function upsertCaseRecord(c: CaseUpsertInput): Promise<string> {
  if (c.courtId) await ensureCourt(c.courtId, c.court);
  const r = await queryOne<{ id: string }>(
    `INSERT INTO cases (id, source, source_id, source_url, case_name, court, court_id, docket_number,
       date_filed, date_terminated, status, nature_of_suit, cause, complaint_url, is_sample, last_checked)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, now())
     ON CONFLICT (source, source_id) DO UPDATE SET
       source_url = COALESCE(EXCLUDED.source_url, cases.source_url),
       case_name = EXCLUDED.case_name,
       court = EXCLUDED.court,
       court_id = COALESCE(EXCLUDED.court_id, cases.court_id),
       docket_number = COALESCE(EXCLUDED.docket_number, cases.docket_number),
       date_filed = COALESCE(EXCLUDED.date_filed, cases.date_filed),
       date_terminated = COALESCE(EXCLUDED.date_terminated, cases.date_terminated),
       nature_of_suit = COALESCE(EXCLUDED.nature_of_suit, cases.nature_of_suit),
       cause = COALESCE(EXCLUDED.cause, cases.cause),
       complaint_url = COALESCE(EXCLUDED.complaint_url, cases.complaint_url),
       last_checked = now()
     RETURNING id`,
    [
      c.id,
      c.source,
      c.sourceId,
      c.sourceUrl ?? null,
      c.caseName,
      c.court,
      c.courtId ?? null,
      c.docketNumber ?? null,
      c.dateFiled ?? null,
      c.dateTerminated ?? null,
      c.status ?? "filed",
      c.natureOfSuit ?? null,
      c.cause ?? null,
      c.complaintUrl ?? null,
      c.isSample ?? false,
    ],
  );
  return r!.id;
}

const FIELD_COLUMNS = {
  status: "status",
  summary: "summary",
  whoQualifies: "who_qualifies",
  claimUrl: "claim_url",
  complaintUrl: "complaint_url",
  claimDeadline: "claim_deadline",
  settlementAmount: "settlement_amount",
  proofOfPurchase: "proof_of_purchase",
  noProofPayout: "no_proof_payout",
  states: "states",
  categories: "categories",
  lastChecked: "last_checked",
  enrichedAt: "enriched_at",
} as const;

/** Set case columns (used by the sample seeder and enrichment). */
export async function updateCaseFields(
  caseId: string,
  fields: Partial<{
    status: CaseStatus;
    summary: string | null;
    whoQualifies: string | null;
    claimUrl: string | null;
    complaintUrl: string | null;
    claimDeadline: string | null;
    settlementAmount: string | null;
    proofOfPurchase: ProofOfPurchase;
    noProofPayout: string | null;
    states: string[];
    categories: string[];
    lastChecked: string | null;
    enrichedAt: string | null;
  }>,
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [caseId];
  for (const [k, v] of Object.entries(fields)) {
    const col = FIELD_COLUMNS[k as keyof typeof FIELD_COLUMNS];
    if (v === undefined || !col) continue;
    params.push(v);
    sets.push(`${col} = $${params.length}`);
  }
  if (k(fields, "settlementAmount")) {
    params.push(parseCents(fields.settlementAmount ?? null));
    sets.push(`settlement_amount_cents = $${params.length}`);
  }
  if (!sets.length) return;
  await query(`UPDATE cases SET ${sets.join(", ")} WHERE id = $1`, params);
}

const k = (o: object, key: string) => Object.prototype.hasOwnProperty.call(o, key) && (o as Record<string, unknown>)[key] !== undefined;

/** "$4,500,000" -> 450000000; ranges and prose -> null. */
function parseCents(amount: string | null): number | null {
  if (!amount) return null;
  const m = amount.replace(/,/g, "").match(/\$?\s*(\d+(?:\.\d+)?)\s*(million|billion|m|bn|b)?\b/i);
  if (!m) return null;
  const mult = /^b|bn|billion$/i.test(m[2] ?? "") ? 1e9 : /^m|million$/i.test(m[2] ?? "") ? 1e6 : 1;
  return Math.round(Number(m[1]) * mult * 100);
}

/** Add docket entries that are not already stored (dedupe on entry number + description). */
export async function mergeDocketEntries(caseId: string, entries: DocketEntry[]): Promise<number> {
  let added = 0;
  for (const e of entries) {
    const r = await queryOne<{ inserted: boolean }>(
      `INSERT INTO docket_entries (case_id, entry_number, date_filed, description, document_url)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (case_id, coalesce(entry_number, -1), md5(description))
       DO UPDATE SET document_url = COALESCE(docket_entries.document_url, EXCLUDED.document_url)
       RETURNING (xmax = 0) AS inserted`,
      [caseId, e.entryNumber, e.dateFiled, e.description, e.documentUrl],
    );
    if (r?.inserted) added++;
  }
  return added;
}

export async function replaceDocketEntries(caseId: string, entries: DocketEntry[]): Promise<void> {
  await query("DELETE FROM docket_entries WHERE case_id = $1", [caseId]);
  await mergeDocketEntries(caseId, entries);
}

export async function clearCaseBrands(caseId: string): Promise<void> {
  await query("DELETE FROM case_brands WHERE case_id = $1", [caseId]);
}

export async function linkCaseBrand(
  caseId: string,
  brandId: string,
  role = "defendant",
  products: string[] = [],
): Promise<void> {
  await query(
    `INSERT INTO case_brands (case_id, brand_id, role, products) VALUES ($1, $2, $3, $4)
     ON CONFLICT (case_id, brand_id) DO UPDATE SET role = EXCLUDED.role, products = EXCLUDED.products`,
    [caseId, brandId, role, products],
  );
}

export async function countCaseBrands(caseId: string): Promise<number> {
  return (await queryOne<{ n: number }>("SELECT COUNT(*)::int AS n FROM case_brands WHERE case_id = $1", [caseId]))?.n ?? 0;
}

/** Find a brand by exact normalized key, or by case-insensitive name/alias match. */
export async function findBrandByNameOrAlias(name: string, normalized: string): Promise<Brand | null> {
  const r = await queryOne(
    `SELECT b.* FROM brands b
     WHERE b.normalized = $2 OR lower(b.name) = lower($1)
        OR EXISTS (SELECT 1 FROM unnest(b.aliases) a WHERE lower(a) = lower($1))
     ORDER BY (b.normalized = $2) DESC LIMIT 1`,
    [name, normalized],
  );
  return r ? toBrand(r) : null;
}

export interface EnrichmentCandidate {
  id: string;
  caseName: string;
  court: string;
  docketNumber: string | null;
  dateFiled: string | null;
  status: CaseStatus;
  natureOfSuit: string | null;
  complaintUrl: string | null;
  sourceUrl: string | null;
  docketEntries: DocketEntry[];
}

/** Real (non-sample) cases missing a summary or any linked brand. */
export async function listCasesForEnrichment(opts: {
  limit: number;
  force?: boolean;
  ids?: string[];
}): Promise<EnrichmentCandidate[]> {
  const params: unknown[] = [opts.limit];
  let where = "NOT c.is_sample";
  if (opts.ids?.length) {
    params.push(opts.ids);
    where += ` AND c.id = ANY($2)`;
  } else if (!opts.force) {
    where += " AND c.enriched_at IS NULL";
  }
  const rows = await query(
    `SELECT c.id, c.case_name, c.court, c.docket_number, c.date_filed, c.status,
            c.nature_of_suit, c.complaint_url, c.source_url
     FROM cases c WHERE ${where} ORDER BY c.date_filed DESC NULLS LAST LIMIT $1`,
    params,
  );
  const out: EnrichmentCandidate[] = [];
  for (const r of rows) {
    const entries = await query(
      `SELECT entry_number, date_filed, description, document_url FROM docket_entries
       WHERE case_id = $1 ORDER BY entry_number NULLS LAST LIMIT 60`,
      [r.id],
    );
    out.push({
      id: r.id as string,
      caseName: r.case_name as string,
      court: r.court as string,
      docketNumber: (r.docket_number as string) ?? null,
      dateFiled: (r.date_filed as string) ?? null,
      status: r.status as CaseStatus,
      natureOfSuit: (r.nature_of_suit as string) ?? null,
      complaintUrl: (r.complaint_url as string) ?? null,
      sourceUrl: (r.source_url as string) ?? null,
      docketEntries: entries.map((e: Row) => ({
        entryNumber: (e.entry_number as number) ?? null,
        dateFiled: (e.date_filed as string) ?? null,
        description: e.description as string,
        documentUrl: (e.document_url as string) ?? null,
      })),
    });
  }
  return out;
}

export async function deleteCase(caseId: string): Promise<void> {
  await query("DELETE FROM cases WHERE id = $1", [caseId]);
}

/** Record an ingest/enrich run; returns a function that closes it with results. */
export async function startIngestRun(kind: string, source: string, params: object) {
  const r = await queryOne<{ id: number }>(
    "INSERT INTO ingest_runs (kind, source, params) VALUES ($1, $2, $3) RETURNING id",
    [kind, source, JSON.stringify(params)],
  );
  const id = r!.id;
  return async (result: { casesUpserted?: number; entriesAdded?: number; error?: string }) => {
    await query(
      `UPDATE ingest_runs SET finished_at = now(), cases_upserted = $2, entries_added = $3, error = $4
       WHERE id = $1`,
      [id, result.casesUpserted ?? 0, result.entriesAdded ?? 0, result.error ?? null],
    );
  };
}

/**
 * Re-derive a case's stage from its stored docket entries (no AI). Only moves forward.
 * Returns the new status when it changed.
 */
export async function applyInferredStatus(caseId: string): Promise<CaseStatus | null> {
  const { inferStatusFromDocket } = await import("@/lib/ingest/status-from-docket");
  const c = await queryOne<{ status: CaseStatus }>("SELECT status FROM cases WHERE id = $1", [caseId]);
  if (!c) return null;
  const entries = await query(
    "SELECT entry_number, date_filed, description, document_url FROM docket_entries WHERE case_id = $1",
    [caseId],
  );
  const inferred = inferStatusFromDocket(
    entries.map((e: Row) => ({
      entryNumber: (e.entry_number as number) ?? null,
      dateFiled: (e.date_filed as string) ?? null,
      description: e.description as string,
      documentUrl: (e.document_url as string) ?? null,
    })),
    c.status,
  );
  if (!inferred || inferred.status === c.status) return null;
  await query("UPDATE cases SET status = $2 WHERE id = $1", [caseId, inferred.status]);
  return inferred.status;
}
