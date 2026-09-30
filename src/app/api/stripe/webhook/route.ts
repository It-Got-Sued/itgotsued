import type Stripe from "stripe";
import { markStripeEvent, syncSubscription, unmarkStripeEvent } from "@/lib/repo/users";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

// POST /api/stripe/webhook. Subscribe these events in the Stripe dashboard:
//   checkout.session.completed, customer.subscription.created,
//   customer.subscription.updated, customer.subscription.deleted
// Each event re-fetches the subscription from Stripe, so out-of-order delivery still ends in the right state.
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !signature) return Response.json({ error: "Not configured." }, { status: 400 });

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(await request.text(), signature, secret);
  } catch {
    return Response.json({ error: "Bad signature." }, { status: 400 });
  }

  let subscriptionId: string | null = null;
  if (event.type === "checkout.session.completed") {
    const s = event.data.object;
    if (s.mode === "subscription" && s.subscription) {
      subscriptionId = typeof s.subscription === "string" ? s.subscription : s.subscription.id;
    }
  } else if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    subscriptionId = event.data.object.id;
  }
  if (!subscriptionId) return Response.json({ received: true });

  if (!(await markStripeEvent(event.id, event.type))) return Response.json({ received: true, duplicate: true });

  try {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    const periodEnd = sub.items.data[0]?.current_period_end;
    const matched = await syncSubscription({
      customerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
      subscriptionId: sub.id,
      status: sub.status,
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    });
    if (!matched) console.warn(`[stripe] ${event.type}: no user for customer of ${sub.id}`);
    return Response.json({ received: true });
  } catch (err) {
    await unmarkStripeEvent(event.id); // let Stripe's retry process it again
    console.error("[stripe] webhook failed:", err instanceof Error ? err.message : err);
    return Response.json({ error: "Processing failed." }, { status: 500 });
  }
}
