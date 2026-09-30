import Stripe from "stripe";

// Stripe client for the Pro subscription. Env:
//   STRIPE_SECRET_KEY       sk_test_... / sk_live_...
//   STRIPE_WEBHOOK_SECRET   whsec_... for /api/stripe/webhook
//   STRIPE_PRICE_ID         optional; otherwise the price is found by PRO_PRICE_LOOKUP_KEY
// Create the product and price with `npm run stripe:setup`.

export const PRO_PRICE_LOOKUP_KEY = "itgotsued_pro_monthly";

const globalForStripe = globalThis as unknown as { __stripe?: Stripe; __proPrice?: Promise<ProPrice> };

export function getStripe(): Stripe {
  if (!globalForStripe.__stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set. Add it to .env.local.");
    globalForStripe.__stripe = new Stripe(key);
  }
  return globalForStripe.__stripe;
}

export type ProPrice = { id: string; unitAmount: number; currency: string; interval: string };

async function loadProPrice(): Promise<ProPrice> {
  const stripe = getStripe();
  const price = process.env.STRIPE_PRICE_ID
    ? await stripe.prices.retrieve(process.env.STRIPE_PRICE_ID)
    : (await stripe.prices.list({ lookup_keys: [PRO_PRICE_LOOKUP_KEY], active: true, limit: 1 })).data[0];
  if (!price) throw new Error(`No Stripe price with lookup key ${PRO_PRICE_LOOKUP_KEY}. Run npm run stripe:setup.`);
  return {
    id: price.id,
    unitAmount: price.unit_amount ?? 0,
    currency: price.currency,
    interval: price.recurring?.interval ?? "month",
  };
}

/** The Pro plan's Stripe price, fetched once per server process. */
export function getProPrice(): Promise<ProPrice> {
  globalForStripe.__proPrice ??= loadProPrice().catch((err) => {
    globalForStripe.__proPrice = undefined; // retry on the next call
    throw err;
  });
  return globalForStripe.__proPrice;
}

/** "$5/month" from Stripe, or the fallback when Stripe is not reachable/configured. */
export async function proPriceLabel(fallback = "$5/month"): Promise<string> {
  try {
    const p = await getProPrice();
    const amount = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: p.currency.toUpperCase(),
      minimumFractionDigits: p.unitAmount % 100 ? 2 : 0,
    }).format(p.unitAmount / 100);
    return `${amount}/${p.interval}`;
  } catch {
    return fallback;
  }
}

/** Absolute site origin for Stripe return URLs. */
export function appUrl(request?: Request): string {
  return (process.env.APP_URL ?? (request ? new URL(request.url).origin : "http://localhost:3000")).replace(/\/$/, "");
}
