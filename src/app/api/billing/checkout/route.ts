import { getCurrentUser } from "@/lib/auth/session";
import { hasActiveSubscription, setStripeCustomerId } from "@/lib/repo/users";
import { appUrl, getProPrice, getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

// Start Stripe Checkout for It Got Sued Pro and 303 to it.
//   POST: the Upgrade buttons (form posts).
//   GET:  the return target after sign-up from /pricing (/signup?next=/api/billing/checkout).
async function startCheckout(request: Request) {
  const base = appUrl(request);
  const user = await getCurrentUser();
  if (!user) return Response.redirect(`${base}/signup?next=/api/billing/checkout`, 303);
  if (hasActiveSubscription(user)) return Response.redirect(`${base}/account`, 303);

  try {
    const stripe = getStripe();
    const price = await getProPrice();
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
      line_items: [{ price: price.id, quantity: 1 }],
      allow_promotion_codes: true,
      subscription_data: { metadata: { user_id: user.id, plan: "pro" } },
      success_url: `${base}/account?checkout=success`,
      cancel_url: `${base}/pricing?checkout=canceled`,
    });
    return Response.redirect(session.url!, 303);
  } catch (err) {
    console.error("[billing] checkout failed:", err instanceof Error ? err.message : err);
    return Response.redirect(`${base}/account?checkout=error`, 303);
  }
}

export const GET = startCheckout;
export const POST = startCheckout;
