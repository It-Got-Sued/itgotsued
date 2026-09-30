import Link from "next/link";
import { getTier } from "@/lib/auth/session";
import { proPriceLabel } from "@/lib/stripe";

/**
 * Shown in place of a feature the visitor's tier doesn't include.
 * `min`: the lowest tier that unlocks it. `next`: where to return after signing in.
 */
export async function Paywall({
  feature,
  next,
  min = "pro",
}: {
  feature: string;
  next: string;
  min?: "free" | "pro";
}) {
  const tier = await getTier();
  if (tier === "pro" || (tier === "free" && min === "free")) return null;
  const price = await proPriceLabel();
  const q = `?next=${encodeURIComponent(next)}`;

  const pitch =
    min === "free"
      ? "Create a free account to see plain-English summaries and claim deadlines, and to check what you own."
      : `Pro unlocks who qualifies, official claim links, court filings, photo and bank scans, and My Items for ${price}. Cancel anytime.`;

  return (
    <section className="card space-y-3 bg-surface-muted p-6">
      <p className="text-sm font-bold text-muted">{min === "free" ? "Free account" : "It Got Sued Pro"}</p>
      <h2 className="text-xl font-bold">{feature}</h2>
      <p className="text-muted">{pitch}</p>
      <div className="flex flex-wrap gap-2">
        {tier === "free" ? (
          <form action="/api/billing/checkout" method="post">
            <button type="submit" className="btn-primary">Upgrade for {price}</button>
          </form>
        ) : (
          <>
            <Link href={`/signup${q}`} className="btn-primary">Create free account</Link>
            <Link href={`/login${q}`} className="btn-secondary">Sign in</Link>
          </>
        )}
        <Link href="/pricing" className="btn-secondary">Compare plans</Link>
      </div>
    </section>
  );
}
