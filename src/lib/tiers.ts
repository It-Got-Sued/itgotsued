// No runtime imports: client components (Scanner) import this file.
import type { User } from "@/lib/repo/users";

// Account tiers:
//   anonymous  not signed in: case name, court, docket number, filing date, status
//   free       signed in: + plain-English summaries, claim deadlines, FREE_DAILY_SCANS text scans a day
//   pro        $5/month: everything

export type Tier = "anonymous" | "free" | "pro";

export const FREE_DAILY_SCANS = 3;

export function tierOf(user: User | null): Tier {
  if (!user) return "anonymous";
  return user.subscriptionStatus === "active" || user.subscriptionStatus === "trialing" ? "pro" : "free";
}

const RANK: Record<Tier, number> = { anonymous: 0, free: 1, pro: 2 };

export function atLeast(tier: Tier, min: Tier): boolean {
  return RANK[tier] >= RANK[min];
}

/** Plan comparison shown on /pricing. `free`/`pro` say whether each plan includes the feature. */
export const PLAN_FEATURES: { label: string; free: boolean | string; pro: boolean | string }[] = [
  { label: "Search every U.S. class action lawsuit", free: true, pro: true },
  { label: "Case status, court, and filing date", free: true, pro: true },
  { label: "Plain-English lawsuit summaries", free: true, pro: true },
  { label: "Claim deadlines", free: true, pro: true },
  { label: "Describe what you own to find lawsuits", free: `${FREE_DAILY_SCANS} a day`, pro: "Unlimited" },
  { label: "Who qualifies for each lawsuit", free: false, pro: true },
  { label: "Official claim links", free: false, pro: true },
  { label: "Settlement amounts", free: false, pro: true },
  { label: "Complaint analysis and court filings", free: false, pro: true },
  { label: "Photo and bank scans", free: false, pro: true },
  { label: "My Items list", free: false, pro: true },
  { label: "Brand alerts by email", free: false, pro: true },
];
