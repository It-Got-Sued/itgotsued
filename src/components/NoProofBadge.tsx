import type { CaseSummary } from "@/lib/types";

/** True when the claim form is open and the settlement pays claims without a receipt. */
export function paysWithoutProof(c: Pick<CaseSummary, "status" | "proofOfPurchase">): boolean {
  return c.status === "claims_open" && c.proofOfPurchase === "not_required";
}

export function NoProofBadge() {
  return (
    <span className="inline-flex items-center rounded-full border border-success-fg/40 bg-success-bg px-2.5 py-0.5 text-xs font-semibold text-success-fg">
      No proof of purchase needed
    </span>
  );
}
