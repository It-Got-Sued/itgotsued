import type { CaseStatus, DocketEntry } from "@/lib/types";

// Infer a case's stage from court filing text, without AI. Only moves a case forward
// (filed -> certified -> settlement_pending) or to dismissed; it never claims "claims open"
// because filings don't carry the official claim form link.

const RULES: Array<{ status: CaseStatus; rank: number; test: RegExp }> = [
  // Settlement (preliminary or final approval, notice/claims schedule, administrator).
  {
    status: "settlement_pending",
    rank: 3,
    test: /\b(preliminary|final)\s+approval\b|\bclaims?\s+deadline\b|\bsettlement\s+(notice|administrator)\b|\bclass\s+(action\s+)?settlement\b/i,
  },
  // Class certification granted.
  {
    status: "certified",
    rank: 2,
    test: /\border\b[^.]*\bgrant(ing|ed)?\b[^.]*\bclass\s+certification\b|\bclass\s+(is\s+)?certified\b/i,
  },
];

const DISMISSED = /\b(order|judgment)\b[^.]*\bdismiss(ing|ed|al)\b|\bnotice\s+of\s+voluntary\s+dismissal\b|\bstipulation\s+of\s+dismissal\b/i;
const RANK: Record<CaseStatus, number> = {
  unknown: 0,
  filed: 1,
  certified: 2,
  settlement_pending: 3,
  claims_open: 4,
  claims_closed: 5,
  dismissed: 6,
};

export interface InferredStatus {
  status: CaseStatus;
  /** The filing text that justified it. */
  evidence: string;
}

/**
 * Best status the filings support, or null when they add nothing beyond `current`.
 * Settlement beats dismissal: a settled class case is often "dismissed" by the final judgment.
 */
export function inferStatusFromDocket(entries: DocketEntry[], current: CaseStatus): InferredStatus | null {
  let best: InferredStatus | null = null;
  let bestRank = RANK[current] ?? 0;
  for (const e of entries) {
    for (const r of RULES) {
      if (r.rank > bestRank && r.test.test(e.description)) {
        best = { status: r.status, evidence: e.description.slice(0, 200) };
        bestRank = r.rank;
      }
    }
  }
  if (!best && (current === "filed" || current === "unknown")) {
    const d = entries.find((e) => DISMISSED.test(e.description));
    if (d) return { status: "dismissed", evidence: d.description.slice(0, 200) };
  }
  return best;
}
