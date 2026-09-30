import Stripe from "stripe";

// Stripe client for the $5/month subscription. Env:
//   STRIPE_SECRET_KEY       sk_test_... / sk_live_...
//   STRIPE_PRICE_ID         price_... for the $5/month recurring price
//   STRIPE_WEBHOOK_SECRET   whsec_... for /api/stripe/webhook

const globalForStripe = globalThis as unknown as { __stripe?: Stripe };

export function getStripe(): Stripe {
  if (!globalForStripe.__stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set. Add it to .env.local.");
    globalForStripe.__stripe = new Stripe(key);
  }
  return globalForStripe.__stripe;
}

export function priceId(): string {
  const id = process.env.STRIPE_PRICE_ID;
  if (!id) throw new Error("STRIPE_PRICE_ID is not set. Add the $5/month price id to .env.local.");
  return id;
}

/** Absolute site origin for Stripe return URLs. */
export function appUrl(request?: Request): string {
  return (process.env.APP_URL ?? (request ? new URL(request.url).origin : "http://localhost:3000")).replace(/\/$/, "");
}
