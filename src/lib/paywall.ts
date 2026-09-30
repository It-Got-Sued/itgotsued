import type { CaseDetail, CaseSummary } from "@/lib/types";
import type { Tier } from "@/lib/tiers";

// Remove the fields a tier can't see (see src/lib/tiers.ts). Anonymous visitors and search
// engines keep the case name, court, docket number, filing date, status, and brands, so case
// pages stay indexable. Free accounts add summaries and claim deadlines. Pro sees everything.

export function shieldSummary<T extends CaseSummary>(c: T, tier: Tier): T {
  if (tier === "pro") return c;
  if (tier === "free") return { ...c, claimUrl: null };
  return { ...c, summary: null, claimUrl: null, claimDeadline: null };
}

export function shieldDetail(c: CaseDetail, tier: Tier): CaseDetail {
  if (tier === "pro") return c;
  return {
    ...shieldSummary(c, tier),
    whoQualifies: null,
    complaintUrl: null,
    settlementAmount: null,
    docketEntries: [],
    complaintAnalysis: null,
  };
}
