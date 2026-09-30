import { getCurrentUser } from "@/lib/auth/session";
import { hasActiveSubscription, setStripeCustomerId } from "@/lib/repo/users";
import { appUrl, getStripe, priceId } from "@/lib/stripe";

export const runtime = "nodejs";

// POST /api/billing/checkout (form post from /account) -> 303 to Stripe Checkout for the $5/month plan.
export async function POST(request: Request) {
  const base = appUrl(request);
  const user = await getCurrentUser();
  if (!user) return Response.redirect(`${base}/login?next=/account`, 303);
  if (hasActiveSubscription(user)) return Response.redirect(`${base}/account`, 303);

  try {
    const stripe = getStripe();
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create(
        { email: user.email, metadata: { user_id: user.id } },
        { idempotencyKey: `customer-${user.id}` },
      );
      customerId = customer.id;
      await setStripeCustomerId(user.id, customerId);
    }
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: priceId(), quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${base}/account?checkout=success`,
      cancel_url: `${base}/account?checkout=canceled`,
    });
    return Response.redirect(session.url!, 303);
  } catch (err) {
    console.error("[billing] checkout failed:", err instanceof Error ? err.message : err);
    return Response.redirect(`${base}/account?checkout=error`, 303);
  }
}
