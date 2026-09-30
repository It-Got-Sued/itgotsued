import type { CaseDetail, CaseSummary } from "@/lib/types";

// Fields only subscribers see. Public visitors (and search engines) get the case name, court,
// docket number, filing date, status, and brands, which keep case pages indexable.

export function shieldSummary<T extends CaseSummary>(c: T): T {
  return { ...c, summary: null, claimUrl: null, claimDeadline: null };
}

export function shieldDetail(c: CaseDetail): CaseDetail {
  return {
    ...shieldSummary(c),
    whoQualifies: null,
    complaintUrl: null,
    settlementAmount: null,
    docketEntries: [],
    complaintAnalysis: null,
  };
}
