import { getDb } from "@/lib/db";
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
  (SELECT json_group_array(b.name) FROM case_brands cb JOIN brands b ON b.id = cb.brand_id
   WHERE cb.case_id = c.id) AS brand_names
`;

function toSummary(r: Row): CaseSummary {
  return {
    id: r.id as string,
    caseName: r.case_name as string,
    court: r.court as string,
    docketNumber: (r.docket_number as string) ?? null,
    dateFiled: (r.date_filed as string) ?? null,
    status: r.status as CaseStatus,
    summary: (r.summary as string) ?? null,
    brands: JSON.parse((r.brand_names as string) ?? "[]"),
    claimUrl: (r.claim_url as string) ?? null,
    claimDeadline: (r.claim_deadline as string) ?? null,
    isSample: Boolean(r.is_sample),
  };
}

// FTS5 query from free text: quote each token so user input cannot inject FTS syntax.
function ftsQuery(q: string): string {
  return q
    .split(/\s+/)
    .map((t) => t.replace(/"/g, ""))
    .filter(Boolean)
    .map((t) => `"${t}"*`)
    .join(" ");
}

export function searchCases(params: CaseSearchParams): CaseSearchResult {
  const db = getDb();
  const where: string[] = [];
  const args: Record<string, string | number> = {};

  if (params.q?.trim()) {
    where.push(
      `(c.rowid IN (SELECT rowid FROM cases_fts WHERE cases_fts MATCH $fts)
        OR c.id IN (SELECT cb.case_id FROM case_brands cb JOIN brands b ON b.id = cb.brand_id
                    WHERE b.name LIKE $like OR b.aliases LIKE $like))`,
    );
    args.fts = ftsQuery(params.q);
    args.like = `%${params.q.trim()}%`;
  }
  if (params.status) {
    where.push("c.status = $status");
    args.status = params.status;
  }
  if (params.brand) {
    where.push(
      "c.id IN (SELECT cb.case_id FROM case_brands cb JOIN brands b ON b.id = cb.brand_id WHERE b.normalized = $brand)",
    );
    args.brand = params.brand;
  }
  if (params.state) {
    where.push("EXISTS (SELECT 1 FROM json_each(c.states) WHERE value = $state)");
    args.state = params.state.toUpperCase();
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const pageSize = Math.min(Math.max(params.pageSize ?? 20, 1), 100);
  const page = Math.max(params.page ?? 1, 1);

  const total = (
    db.prepare(`SELECT COUNT(*) AS n FROM cases c ${whereSql}`).get(args) as { n: number }
  ).n;

  const rows = db
    .prepare(
      `SELECT ${SUMMARY_COLUMNS} FROM cases c ${whereSql}
       ORDER BY (c.status = 'claims_open') DESC, c.date_filed DESC
       LIMIT $limit OFFSET $offset`,
    )
    .all({ ...args, limit: pageSize, offset: (page - 1) * pageSize }) as Row[];

  return { cases: rows.map(toSummary), total };
}

export function getCase(id: string): CaseDetail | null {
  const db = getDb();
  const r = db
    .prepare(
      `SELECT ${SUMMARY_COLUMNS}, c.source, c.source_url, c.nature_of_suit, c.who_qualifies,
              c.complaint_url, c.settlement_amount, c.states, c.categories, c.last_checked
       FROM cases c WHERE c.id = $id`,
    )
    .get({ id }) as Row | undefined;
  if (!r) return null;

  const entries = db
    .prepare(
      `SELECT entry_number, date_filed, description, document_url FROM docket_entries
       WHERE case_id = $id ORDER BY entry_number`,
    )
    .all({ id }) as Row[];

  return {
    ...toSummary(r),
    source: r.source as string,
    sourceUrl: (r.source_url as string) ?? null,
    natureOfSuit: (r.nature_of_suit as string) ?? null,
    whoQualifies: (r.who_qualifies as string) ?? null,
    complaintUrl: (r.complaint_url as string) ?? null,
    settlementAmount: (r.settlement_amount as string) ?? null,
    states: JSON.parse((r.states as string) ?? "[]"),
    categories: JSON.parse((r.categories as string) ?? "[]"),
    lastChecked: (r.last_checked as string) ?? null,
    docketEntries: entries.map(
      (e): DocketEntry => ({
        entryNumber: (e.entry_number as number) ?? null,
        dateFiled: (e.date_filed as string) ?? null,
        description: e.description as string,
        documentUrl: (e.document_url as string) ?? null,
      }),
    ),
  };
}

export function findCasesByBrandIds(brandIds: string[]): Map<string, CaseSummary[]> {
  const result = new Map<string, CaseSummary[]>();
  if (!brandIds.length) return result;
  const db = getDb();
  const stmt = db.prepare(
    `SELECT ${SUMMARY_COLUMNS} FROM cases c
     JOIN case_brands cb ON cb.case_id = c.id
     WHERE cb.brand_id = $brandId
     ORDER BY (c.status = 'claims_open') DESC, c.date_filed DESC`,
  );
  for (const brandId of brandIds) {
    result.set(brandId, (stmt.all({ brandId }) as Row[]).map(toSummary));
  }
  return result;
}
