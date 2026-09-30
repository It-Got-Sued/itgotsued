import { query, queryOne } from "@/lib/db";
import { getComplaintAnalysis } from "@/lib/repo/complaints";
import type {
  CaseDetail,
  CaseSearchParams,
  CaseSearchResult,
  CaseStatus,
  CaseSummary,
  DocketEntry,
} from "@/lib/types";

type Row = Record<string, unknown>;

const SUMMARY_COLUMNS = `
  c.id, c.case_name, c.court, c.docket_number, c.date_filed, c.status, c.summary,
  c.claim_url, c.claim_deadline, c.is_sample,
  COALESCE((SELECT array_agg(b.name ORDER BY b.name) FROM case_brands cb
            JOIN brands b ON b.id = cb.brand_id WHERE cb.case_id = c.id), '{}') AS brand_names
`;

const iso = (v: unknown): string | null =>
  v == null ? null : v instanceof Date ? v.toISOString() : String(v);

function toSummary(r: Row): CaseSummary {
  return {
    id: r.id as string,
    caseName: r.case_name as string,
    court: r.court as string,
    docketNumber: (r.docket_number as string) ?? null,
    dateFiled: iso(r.date_filed),
    status: r.status as CaseStatus,
    summary: (r.summary as string) ?? null,
    brands: (r.brand_names as string[]) ?? [],
    claimUrl: (r.claim_url as string) ?? null,
    claimDeadline: iso(r.claim_deadline),
    isSample: Boolean(r.is_sample),
  };
}

/** Builds WHERE clauses with numbered placeholders. */
class Where {
  clauses: string[] = [];
  params: unknown[] = [];
  arg(v: unknown) {
    this.params.push(v);
    return `$${this.params.length}`;
  }
  toString() {
    return this.clauses.length ? `WHERE ${this.clauses.join(" AND ")}` : "";
  }
}

export async function searchCases(params: CaseSearchParams): Promise<CaseSearchResult> {
  const w = new Where();

  if (params.q?.trim()) {
    const q = params.q.trim();
    const tsq = w.arg(q);
    const like = w.arg(`%${q}%`);
    w.clauses.push(
      `(c.search @@ websearch_to_tsquery('english', ${tsq})
        OR c.case_name ILIKE ${like}
        OR c.id IN (SELECT d.case_id FROM docket_entries d WHERE d.description ILIKE ${like})
        OR c.id IN (SELECT cb.case_id FROM case_brands cb JOIN brands b ON b.id = cb.brand_id
                    WHERE b.name ILIKE ${like}
                       OR EXISTS (SELECT 1 FROM unnest(b.aliases) a WHERE a ILIKE ${like})))`,
    );
  }
  if (params.status) w.clauses.push(`c.status = ${w.arg(params.status)}`);
  if (params.brand) {
    w.clauses.push(
      `c.id IN (SELECT cb.case_id FROM case_brands cb JOIN brands b ON b.id = cb.brand_id
                WHERE b.normalized = ${w.arg(params.brand)})`,
    );
  }
  if (params.state) w.clauses.push(`${w.arg(params.state.toUpperCase())} = ANY(c.states)`);

  const pageSize = Math.min(Math.max(params.pageSize ?? 20, 1), 100);
  const page = Math.max(params.page ?? 1, 1);
  const where = w.toString();

  const [countRow, rows] = await Promise.all([
    queryOne<{ n: number }>(`SELECT COUNT(*)::int AS n FROM cases c ${where}`, w.params),
    query(
      `SELECT ${SUMMARY_COLUMNS} FROM cases c ${where}
       ORDER BY (c.status = 'claims_open') DESC, c.is_sample ASC, c.date_filed DESC NULLS LAST, c.id
       LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      w.params,
    ),
  ]);

  return { cases: rows.map(toSummary), total: countRow?.n ?? 0 };
}

export async function getCase(id: string): Promise<CaseDetail | null> {
  const r = await queryOne(
    `SELECT ${SUMMARY_COLUMNS}, c.source, c.source_url, c.nature_of_suit, c.who_qualifies,
            c.complaint_url, c.settlement_amount, c.states, c.categories, c.last_checked, c.updated_at
     FROM cases c WHERE c.id = $1`,
    [id],
  );
  if (!r) return null;

  const [entries, complaintAnalysis] = await Promise.all([
    query(
      `SELECT entry_number, date_filed, description, document_url FROM docket_entries
       WHERE case_id = $1 ORDER BY entry_number NULLS LAST, date_filed, id`,
      [id],
    ),
    getComplaintAnalysis(id),
  ]);

  return {
    ...toSummary(r),
    source: r.source as string,
    sourceUrl: (r.source_url as string) ?? null,
    natureOfSuit: (r.nature_of_suit as string) ?? null,
    whoQualifies: (r.who_qualifies as string) ?? null,
    complaintUrl: (r.complaint_url as string) ?? null,
    settlementAmount: (r.settlement_amount as string) ?? null,
    states: (r.states as string[]) ?? [],
    categories: (r.categories as string[]) ?? [],
    lastChecked: iso(r.last_checked),
    updatedAt: iso(r.updated_at),
    docketEntries: entries.map(
      (e): DocketEntry => ({
        entryNumber: (e.entry_number as number) ?? null,
        dateFiled: iso(e.date_filed),
        description: e.description as string,
        documentUrl: (e.document_url as string) ?? null,
      }),
    ),
    complaintAnalysis,
  };
}

export async function findCasesByBrandIds(brandIds: string[]): Promise<Map<string, CaseSummary[]>> {
  const result = new Map<string, CaseSummary[]>();
  if (!brandIds.length) return result;
  const rows = await query(
    `SELECT cb.brand_id AS match_brand_id, ${SUMMARY_COLUMNS} FROM cases c
     JOIN case_brands cb ON cb.case_id = c.id
     WHERE cb.brand_id = ANY($1)
     ORDER BY (c.status = 'claims_open') DESC, c.date_filed DESC NULLS LAST`,
    [brandIds],
  );
  for (const id of brandIds) result.set(id, []);
  for (const r of rows) result.get(r.match_brand_id as string)?.push(toSummary(r));
  return result;
}

export interface CaseEvidence {
  /** Case name, summary, class definition, products at issue and docket text, joined. */
  text: string;
  /** True once AI enrichment has read the case (summary present). */
  enriched: boolean;
}

/** Everything we know a case says, for checking whether it names a specific brand. */
export async function getCaseEvidence(caseIds: string[]): Promise<Map<string, CaseEvidence>> {
  const out = new Map<string, CaseEvidence>();
  if (!caseIds.length) return out;
  const rows = await query<{ id: string; text: string; enriched: boolean }>(
    `SELECT c.id, (c.summary IS NOT NULL) AS enriched,
            concat_ws(' ', c.case_name, c.summary, c.who_qualifies,
              (SELECT string_agg(array_to_string(cb.products, ' '), ' ') FROM case_brands cb WHERE cb.case_id = c.id),
              (SELECT string_agg(d.description, ' ') FROM docket_entries d WHERE d.case_id = c.id)) AS text
     FROM cases c WHERE c.id = ANY($1)`,
    [caseIds],
  );
  for (const r of rows) out.set(r.id, { text: r.text ?? "", enriched: r.enriched });
  return out;
}
