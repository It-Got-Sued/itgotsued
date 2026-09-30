import type { Metadata } from "next";
import { Alert } from "@/components/Alert";
import { logout } from "@/lib/auth/actions";
import { requireUser } from "@/lib/auth/session";
import { hasActiveSubscription } from "@/lib/repo/users";
import { usedToday } from "@/lib/repo/usage";
import { proPriceLabel } from "@/lib/stripe";
import { FREE_DAILY_SCANS, tierOf } from "@/lib/tiers";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Your Account",
  description: "Manage your It Got Sued account and subscription.",
  path: "/account",
  noindex: true,
});

const NOTICES: Record<string, { tone: "success" | "info" | "danger"; text: string }> = {
  welcome: { tone: "success", text: "Welcome! Your free account is ready. Upgrade to Pro below to unlock everything." },
  reset: { tone: "success", text: "Your password was changed. Other devices were signed out." },
  success: { tone: "success", text: "Thanks for subscribing! It can take a few seconds to show as active — refresh if needed." },
  canceled: { tone: "info", text: "Checkout canceled. You weren't charged." },
  error: { tone: "danger", text: "Billing is unavailable right now. Please try again in a minute." },
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string; reset?: string; checkout?: string }>;
}) {
  const user = await requireUser("/account");
  const sp = await searchParams;
  const notice = NOTICES[sp.checkout ?? (sp.reset ? "reset" : sp.welcome ? "welcome" : "")];
  const active = hasActiveSubscription(user);
  const pro = tierOf(user) === "pro";
  const [price, scansUsed] = await Promise.all([proPriceLabel(), pro ? 0 : usedToday(user.id, "scan")]);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Your account</h1>
        <p className="text-muted">{user.email}</p>
      </header>

      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

      <section className="card space-y-3 p-6">
        <h2 className="text-xl font-bold">Plan: {pro ? "Pro" : "Free"}</h2>
        {pro && !active ? (
          <p className="text-muted">Pro is included with your admin account.</p>
        ) : active ? (
          <>
            <p>
              <strong>It Got Sued Pro — {price}.</strong>{" "}
              {user.currentPeriodEnd &&
                (user.cancelAtPeriodEnd
                  ? `Ends ${fmtDate(user.currentPeriodEnd)}.`
                  : `Renews ${fmtDate(user.currentPeriodEnd)}.`)}
            </p>
            <form action="/api/billing/portal" method="post">
              <button type="submit" className="btn-secondary">Manage billing</button>
            </form>
          </>
        ) : (
          <>
            {user.subscriptionStatus === "past_due" || user.subscriptionStatus === "unpaid" ? (
              <Alert tone="warn">Your last payment failed. Update your card to keep access.</Alert>
            ) : (
              <p className="text-muted">
                {Math.max(0, FREE_DAILY_SCANS - scansUsed)} of {FREE_DAILY_SCANS} free scans left today.
                Pro unlocks who qualifies, claim links, court filings, photo and bank scans, My Items,
                and brand alerts. <Link href="/pricing" className="link">Compare plans</Link>
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <form action="/api/billing/checkout" method="post">
                <button type="submit" className="btn-primary">Upgrade to Pro for {price}</button>
              </form>
              {user.stripeCustomerId && (
                <form action="/api/billing/portal" method="post">
                  <button type="submit" className="btn-secondary">Manage billing</button>
                </form>
              )}
            </div>
          </>
        )}
      </section>

      <form action={logout}>
        <button type="submit" className="btn-secondary">Sign out</button>
      </form>
    </div>
  );
}
