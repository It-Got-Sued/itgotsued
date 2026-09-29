// Write-side helpers for ingestion, enrichment and seeding. Additive to cases.ts/brands.ts.
import { getDb } from "@/lib/db";
import type { Brand, CaseStatus, DocketEntry } from "@/lib/types";

type Row = Record<string, unknown>;
type SqlValue = string | number | null;

export interface CaseUpsertInput {
  id: string;
  source: string;
  sourceId: string;
  sourceUrl?: string | null;
  caseName: string;
  court: string;
  docketNumber?: string | null;
  dateFiled?: string | null;
  /** Used on insert only; an existing row keeps its (possibly enriched) status. */
  status?: CaseStatus;
  natureOfSuit?: string | null;
  complaintUrl?: string | null;
  isSample?: boolean;
}

/**
 * Insert a case or refresh its docket metadata. Idempotent on (source, source_id).
 * Enriched fields (status, summary, who_qualifies, states, categories, claim_*) are never
 * overwritten here. Returns the stable case id (the existing one when the row already existed).
 */
export function upsertCaseRecord(c: CaseUpsertInput): string {
  const db = getDb();
  db.prepare(
    `INSERT INTO cases (id, source, source_id, source_url, case_name, court, docket_number,
       date_filed, status, nature_of_suit, complaint_url, is_sample, last_checked)
     VALUES ($id, $source, $sourceId, $sourceUrl, $caseName, $court, $docketNumber,
       $dateFiled, $status, $nos, $complaintUrl, $isSample, $now)
     ON CONFLICT(source, source_id) DO UPDATE SET
       source_url = COALESCE(excluded.source_url, cases.source_url),
       case_name = excluded.case_name,
       court = excluded.court,
       docket_number = COALESCE(excluded.docket_number, cases.docket_number),
       date_filed = COALESCE(excluded.date_filed, cases.date_filed),
       nature_of_suit = COALESCE(excluded.nature_of_suit, cases.nature_of_suit),
       complaint_url = COALESCE(excluded.complaint_url, cases.complaint_url),
       last_checked = excluded.last_checked`,
  ).run({
    id: c.id,
    source: c.source,
    sourceId: c.sourceId,
    sourceUrl: c.sourceUrl ?? null,
    caseName: c.caseName,
    court: c.court,
    docketNumber: c.docketNumber ?? null,
    dateFiled: c.dateFiled ?? null,
    status: c.status ?? "filed",
    nos: c.natureOfSuit ?? null,
    complaintUrl: c.complaintUrl ?? null,
    isSample: c.isSample ? 1 : 0,
    now: new Date().toISOString(),
  });
  const r = db
    .prepare("SELECT id FROM cases WHERE source = $source AND source_id = $sourceId")
    .get({ source: c.source, sourceId: c.sourceId }) as Row;
  return r.id as string;
}

/** Set arbitrary case columns (used by the sample seeder and enrichment). */
export function updateCaseFields(
  caseId: string,
  fields: Partial<{
    status: CaseStatus;
    summary: string | null;
    whoQualifies: string | null;
    claimUrl: string | null;
    claimDeadline: string | null;
    settlementAmount: string | null;
    states: string[];
    categories: string[];
    lastChecked: string | null;
  }>,
): void {
  const map: Record<string, string> = {
    status: "status",
    summary: "summary",
    whoQualifies: "who_qualifies",
    claimUrl: "claim_url",
    claimDeadline: "claim_deadline",
    settlementAmount: "settlement_amount",
    states: "states",
    categories: "categories",
    lastChecked: "last_checked",
  };
  const sets: string[] = [];
  const args: Record<string, SqlValue> = { id: caseId };
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || !map[k]) continue;
    sets.push(`${map[k]} = $${k}`);
    args[k] = Array.isArray(v) ? JSON.stringify(v) : (v as SqlValue);
  }
  if (!sets.length) return;
  getDb().prepare(`UPDATE cases SET ${sets.join(", ")} WHERE id = $id`).run(args);
}

/** Add docket entries that are not already stored (dedupe on entry number + description). */
export function mergeDocketEntries(caseId: string, entries: DocketEntry[]): number {
  const db = getDb();
  const exists = db.prepare(
    `SELECT rowid, document_url FROM docket_entries WHERE case_id = $caseId
       AND entry_number IS $entryNumber AND description = $description`,
  );
  const insert = db.prepare(
    `INSERT INTO docket_entries (case_id, entry_number, date_filed, description, document_url)
     VALUES ($caseId, $entryNumber, $dateFiled, $description, $documentUrl)`,
  );
  const fillUrl = db.prepare(
    "UPDATE docket_entries SET document_url = $documentUrl WHERE rowid = $rowid",
  );
  let added = 0;
  for (const e of entries) {
    const key = { caseId, entryNumber: e.entryNumber, description: e.description };
    const found = exists.get(key) as Row | undefined;
    if (found) {
      if (!found.document_url && e.documentUrl) {
        fillUrl.run({ rowid: found.rowid as number, documentUrl: e.documentUrl });
      }
      continue;
    }
    insert.run({ ...key, dateFiled: e.dateFiled, documentUrl: e.documentUrl });
    added++;
  }
  return added;
}

export function replaceDocketEntries(caseId: string, entries: DocketEntry[]): void {
  getDb().prepare("DELETE FROM docket_entries WHERE case_id = $caseId").run({ caseId });
  mergeDocketEntries(caseId, entries);
}

export function linkCaseBrand(
  caseId: string,
  brandId: string,
  role = "defendant",
  products: string[] = [],
): void {
  getDb()
    .prepare(
      `INSERT INTO case_brands (case_id, brand_id, role, products)
       VALUES ($caseId, $brandId, $role, $products)
       ON CONFLICT(case_id, brand_id) DO UPDATE SET role = excluded.role, products = excluded.products`,
    )
    .run({ caseId, brandId, role, products: JSON.stringify(products) });
}

export function countCaseBrands(caseId: string): number {
  return (
    getDb().prepare("SELECT COUNT(*) AS n FROM case_brands WHERE case_id = $caseId").get({
      caseId,
    }) as { n: number }
  ).n;
}

/** Find a brand by exact normalized key, or by case-insensitive name/alias match. */
export function findBrandByNameOrAlias(name: string, normalized: string): Brand | null {
  const r = getDb()
    .prepare(
      `SELECT b.* FROM brands b
       WHERE b.normalized = $normalized OR lower(b.name) = lower($name)
          OR EXISTS (SELECT 1 FROM json_each(b.aliases) WHERE lower(value) = lower($name))
       ORDER BY (b.normalized = $normalized) DESC LIMIT 1`,
    )
    .get({ name, normalized }) as Row | undefined;
  if (!r) return null;
  return {
    id: r.id as string,
    name: r.name as string,
    normalized: r.normalized as string,
    parentCompany: (r.parent_company as string) ?? null,
    aliases: JSON.parse((r.aliases as string) ?? "[]"),
    category: (r.category as string) ?? null,
  };
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
export function listCasesForEnrichment(opts: {
  limit: number;
  force?: boolean;
  ids?: string[];
}): EnrichmentCandidate[] {
  const db = getDb();
  const args: Record<string, SqlValue> = { limit: opts.limit };
  let where = "c.is_sample = 0";
  if (opts.ids?.length) {
    where += ` AND c.id IN (${opts.ids.map((_, i) => `$id${i}`).join(",")})`;
    opts.ids.forEach((id, i) => (args[`id${i}`] = id));
  } else if (!opts.force) {
    where +=
      " AND (c.summary IS NULL OR NOT EXISTS (SELECT 1 FROM case_brands cb WHERE cb.case_id = c.id))";
  }
  const rows = db
    .prepare(
      `SELECT c.id, c.case_name, c.court, c.docket_number, c.date_filed, c.status,
              c.nature_of_suit, c.complaint_url, c.source_url
       FROM cases c WHERE ${where} ORDER BY c.date_filed DESC LIMIT $limit`,
    )
    .all(args) as Row[];
  const entryStmt = db.prepare(
    `SELECT entry_number, date_filed, description, document_url FROM docket_entries
     WHERE case_id = $id ORDER BY entry_number LIMIT 60`,
  );
  return rows.map((r) => ({
    id: r.id as string,
    caseName: r.case_name as string,
    court: r.court as string,
    docketNumber: (r.docket_number as string) ?? null,
    dateFiled: (r.date_filed as string) ?? null,
    status: r.status as CaseStatus,
    natureOfSuit: (r.nature_of_suit as string) ?? null,
    complaintUrl: (r.complaint_url as string) ?? null,
    sourceUrl: (r.source_url as string) ?? null,
    docketEntries: (entryStmt.all({ id: r.id as string }) as Row[]).map((e) => ({
      entryNumber: (e.entry_number as number) ?? null,
      dateFiled: (e.date_filed as string) ?? null,
      description: e.description as string,
      documentUrl: (e.document_url as string) ?? null,
    })),
  }));
}

export function deleteCase(caseId: string): void {
  getDb().prepare("DELETE FROM cases WHERE id = $caseId").run({ caseId });
}
