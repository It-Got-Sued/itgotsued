import type { Metadata } from "next";
import { Alert } from "@/components/Alert";
import { logout } from "@/lib/auth/actions";
import { requireUser } from "@/lib/auth/session";
import { hasActiveSubscription } from "@/lib/repo/users";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Your Account",
  description: "Manage your It Got Sued account and subscription.",
  path: "/account",
  noindex: true,
});

const NOTICES: Record<string, { tone: "success" | "info" | "danger"; text: string }> = {
  welcome: { tone: "success", text: "Welcome! Your account is ready. Subscribe below to unlock everything." },
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

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Your account</h1>
        <p className="text-muted">{user.email}</p>
      </header>

      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

      <section className="card space-y-3 p-6">
        <h2 className="text-xl font-bold">Subscription</h2>
        {active ? (
          <>
            <p>
              <strong>It Got Sued — $5/month.</strong>{" "}
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
                Unlock lawsuit details, who qualifies, claim links and deadlines, court filings,
                scanning, My Items, and brand alerts. Cancel anytime.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <form action="/api/billing/checkout" method="post">
                <button type="submit" className="btn-primary">Subscribe for $5/month</button>
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
