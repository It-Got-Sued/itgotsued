import { getCurrentUser } from "@/lib/auth/session";
import { appUrl, getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

// POST /api/billing/portal -> 303 to the Stripe customer portal (update card, cancel, invoices).
export async function POST(request: Request) {
  const base = appUrl(request);
  const user = await getCurrentUser();
  if (!user) return Response.redirect(`${base}/login?next=/account`, 303);
  if (!user.stripeCustomerId) return Response.redirect(`${base}/account`, 303);

  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${base}/account`,
    });
    return Response.redirect(session.url, 303);
  } catch (err) {
    console.error("[billing] portal failed:", err instanceof Error ? err.message : err);
    return Response.redirect(`${base}/account?checkout=error`, 303);
  }
}
