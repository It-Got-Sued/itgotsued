import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";

/** Shown in place of a subscriber-only feature. `next` is where to return after signing in. */
export async function Paywall({ feature, next }: { feature: string; next: string }) {
  const user = await getCurrentUser();
  const q = `?next=${encodeURIComponent(next)}`;
  return (
    <section className="card space-y-3 bg-surface-muted p-6">
      <p className="text-sm font-bold text-muted">Subscribers only</p>
      <h2 className="text-xl font-bold">{feature}</h2>
      <p className="text-muted">
        Unlock plain-English summaries, who qualifies, claim links and deadlines, court filings,
        scanning, and brand alerts for $5/month. Cancel anytime.
      </p>
      <div className="flex flex-wrap gap-2">
        {user ? (
          <form action="/api/billing/checkout" method="post">
            <button type="submit" className="btn-primary">Subscribe for $5/month</button>
          </form>
        ) : (
          <>
            <Link href={`/signup${q}`} className="btn-primary">Create account</Link>
            <Link href={`/login${q}`} className="btn-secondary">Sign in</Link>
          </>
        )}
      </div>
    </section>
  );
}
