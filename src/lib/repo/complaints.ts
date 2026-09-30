import { query, queryOne } from "@/lib/db";
import type { ComplaintAnalysis, ComplaintAnalysisRecord } from "@/lib/types";

type Row = Record<string, unknown>;

export interface ComplaintCandidate {
  id: string;
  caseName: string;
  court: string;
  docketNumber: string | null;
  dateFiled: string | null;
  natureOfSuit: string | null;
  complaintUrl: string;
}

/**
 * Cases with a complaint PDF that has not been read yet (no analysis row, or the row is
 * for a different complaint URL). Sample cases are skipped. `ids` bypasses the
 * "not read yet" filter only when `force` is set.
 */
export async function listComplaintsToParse(opts: {
  limit: number;
  ids?: string[];
  force?: boolean;
}): Promise<ComplaintCandidate[]> {
  const params: unknown[] = [];
  const where = ["c.complaint_url IS NOT NULL", "NOT c.is_sample"];
  if (opts.ids?.length) {
    params.push(opts.ids);
    where.push(`c.id = ANY($${params.length})`);
  }
  if (!opts.force) {
    where.push(
      "NOT EXISTS (SELECT 1 FROM complaint_analyses a WHERE a.case_id = c.id AND a.complaint_url = c.complaint_url)",
    );
  }
  params.push(opts.limit);
  const rows = await query(
    `SELECT c.id, c.case_name, c.court, c.docket_number, c.date_filed, c.nature_of_suit, c.complaint_url
     FROM cases c WHERE ${where.join(" AND ")}
     ORDER BY c.date_filed DESC NULLS LAST, c.id
     LIMIT $${params.length}`,
    params,
  );
  return rows.map((r: Row) => ({
    id: r.id as string,
    caseName: r.case_name as string,
    court: r.court as string,
    docketNumber: (r.docket_number as string) ?? null,
    dateFiled: (r.date_filed as string) ?? null,
    natureOfSuit: (r.nature_of_suit as string) ?? null,
    complaintUrl: r.complaint_url as string,
  }));
}

export async function saveComplaintAnalysis(input: {
  caseId: string;
  complaintUrl: string;
  status: "parsed" | "unparseable";
  error?: string | null;
  pageCount?: number | null;
  textChars?: number | null;
  truncated?: boolean;
  model?: string | null;
  analysis?: ComplaintAnalysis | null;
}): Promise<void> {
  await query(
    `INSERT INTO complaint_analyses
       (case_id, complaint_url, status, error, page_count, text_chars, truncated, model, analysis, parsed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
     ON CONFLICT (case_id) DO UPDATE SET
       complaint_url = EXCLUDED.complaint_url,
       status = EXCLUDED.status,
       error = EXCLUDED.error,
       page_count = EXCLUDED.page_count,
       text_chars = EXCLUDED.text_chars,
       truncated = EXCLUDED.truncated,
       model = EXCLUDED.model,
       analysis = EXCLUDED.analysis,
       parsed_at = now()`,
    [
      input.caseId,
      input.complaintUrl,
      input.status,
      input.error ?? null,
      input.pageCount ?? null,
      input.textChars ?? null,
      input.truncated ?? false,
      input.model ?? null,
      input.analysis ? JSON.stringify(input.analysis) : null,
    ],
  );
}

export async function getComplaintAnalysis(caseId: string): Promise<ComplaintAnalysisRecord | null> {
  const r = await queryOne(
    `SELECT complaint_url, status, error, page_count, truncated, model, analysis, parsed_at
     FROM complaint_analyses WHERE case_id = $1`,
    [caseId],
  );
  if (!r) return null;
  return {
    status: r.status as ComplaintAnalysisRecord["status"],
    error: (r.error as string) ?? null,
    complaintUrl: r.complaint_url as string,
    pageCount: (r.page_count as number) ?? null,
    truncated: Boolean(r.truncated),
    model: (r.model as string) ?? null,
    parsedAt: r.parsed_at instanceof Date ? r.parsed_at.toISOString() : String(r.parsed_at),
    analysis: (r.analysis as ComplaintAnalysis) ?? null,
  };
}
