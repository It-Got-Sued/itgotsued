import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/Alert";
import { getTier } from "@/lib/auth/session";
import { pageMetadata } from "@/lib/seo";
import { proPriceLabel } from "@/lib/stripe";
import { PLAN_FEATURES } from "@/lib/tiers";

export const metadata: Metadata = pageMetadata({
  title: "Pricing: Free and Pro Plans",
  description:
    "Search class action lawsuits free. Upgrade to It Got Sued Pro for who qualifies, official claim links, court filings, and photo and bank scans.",
  path: "/pricing",
});

function Mark({ value }: { value: boolean | string }) {
  if (typeof value === "string") return <span className="font-semibold">{value}</span>;
  return value ? (
    <span className="font-bold text-success-fg">
      <span aria-hidden>✓</span>
      <span className="sr-only">Included</span>
    </span>
  ) : (
    <span className="text-muted">
      <span aria-hidden>—</span>
      <span className="sr-only">Not included</span>
    </span>
  );
}

export default async function PricingPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const [tier, price, sp] = await Promise.all([getTier(), proPriceLabel(), searchParams]);
  const [amount, interval] = price.split("/");

  return (
    <div className="space-y-10">
      <header className="max-w-2xl space-y-3">
        <h1 className="text-4xl font-extrabold sm:text-5xl">Pick your plan</h1>
        <p className="text-lg text-muted">
          Start free. Upgrade when you want to know if you qualify and where to file.
        </p>
      </header>

      {sp.checkout === "canceled" && <Alert tone="info">Checkout canceled. You weren&apos;t charged.</Alert>}

      <div className="grid gap-6 md:grid-cols-2">
        <section aria-labelledby="free-plan" className="card flex flex-col gap-5 p-6 sm:p-8">
          <div className="space-y-1">
            <h2 id="free-plan" className="text-2xl font-bold">Free</h2>
            <p>
              <span className="font-display text-4xl">$0</span>
            </p>
            <p className="text-muted">Browse lawsuits and try a few scans.</p>
          </div>
          <ul className="space-y-2">
            {PLAN_FEATURES.filter((f) => f.free).map((f) => (
              <li key={f.label} className="flex gap-2">
                <Mark value={f.free === true ? true : f.free} />
                <span>{f.label}</span>
              </li>
            ))}
          </ul>
          <div className="mt-auto">
            {tier === "anonymous" ? (
              <Link href="/signup" className="btn-secondary w-full">Register free</Link>
            ) : (
              <p className="text-center font-semibold text-muted">
                {tier === "free" ? "Your current plan" : "Included in Pro"}
              </p>
            )}
          </div>
        </section>

        <section aria-labelledby="pro-plan" className="card flex flex-col gap-5 p-6 shadow-hard sm:p-8">
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <h2 id="pro-plan" className="text-2xl font-bold">Pro</h2>
              <span className="chip bg-sticker text-[#17175c]">Everything</span>
            </div>
            <p>
              <span className="font-display text-4xl">{amount}</span>
              <span className="text-muted">/{interval}</span>
            </p>
            <p className="text-muted">Full access to every feature. Cancel anytime.</p>
          </div>
          <ul className="space-y-2">
            {PLAN_FEATURES.map((f) => (
              <li key={f.label} className="flex gap-2">
                <Mark value={f.pro} />
                <span>{f.label}</span>
              </li>
            ))}
          </ul>
          <div className="mt-auto">
            {tier === "anonymous" ? (
              <Link href="/signup?next=/api/billing/checkout" className="btn-primary w-full">
                Register and go Pro
              </Link>
            ) : tier === "free" ? (
              <form action="/api/billing/checkout" method="post">
                <button type="submit" className="btn-primary w-full">Upgrade for {price}</button>
              </form>
            ) : (
              <form action="/api/billing/portal" method="post">
                <button type="submit" className="btn-secondary w-full">Your plan · Manage billing</button>
              </form>
            )}
          </div>
        </section>
      </div>

      {/* Full comparison */}
      <section aria-labelledby="compare-heading" className="space-y-4">
        <h2 id="compare-heading" className="text-2xl font-bold">Compare plans</h2>
        <div className="card overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b-2 border-border">
              <tr>
                <th className="px-4 py-3">Feature</th>
                <th className="px-4 py-3 text-center">Free</th>
                <th className="px-4 py-3 text-center">Pro</th>
              </tr>
            </thead>
            <tbody>
              {PLAN_FEATURES.map((f) => (
                <tr key={f.label} className="border-b border-hairline last:border-0">
                  <td className="px-4 py-3">{f.label}</td>
                  <td className="px-4 py-3 text-center"><Mark value={f.free} /></td>
                  <td className="px-4 py-3 text-center"><Mark value={f.pro} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-muted">
          Payments are handled by Stripe. We never see your card number. Already have an account?{" "}
          <Link href="/login?next=/pricing" className="link">Sign in</Link>.
        </p>
      </section>
    </div>
  );
}
