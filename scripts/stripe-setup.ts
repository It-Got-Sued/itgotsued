// Create (or find) the It Got Sued Pro product, its $5/month price, and a customer portal
// configuration in the Stripe account for STRIPE_SECRET_KEY. Safe to re-run: the price is
// found by its lookup key, so nothing is duplicated.
//   npm run stripe:setup
import "./_env";
import type Stripe from "stripe";
import { getStripe, PRO_PRICE_LOOKUP_KEY } from "@/lib/stripe";

// Required by Stripe Managed Payments (on by default for new accounts): an eligible digital tax code.
// "Website Information Services - Personal Use": online search and data comparison for consumers.
const TAX_CODE = "txcd_10701401";

async function main() {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  const mode = key.startsWith("sk_live_") || key.startsWith("rk_live_") ? "LIVE" : "test";
  const stripe = getStripe();

  const existing = await stripe.prices.list({ lookup_keys: [PRO_PRICE_LOOKUP_KEY], expand: ["data.product"], limit: 1 });
  let price = existing.data[0];
  if (price) {
    console.log(`found existing price ${price.id} (${mode} mode)`);
    const product = price.product as Stripe.Product;
    const taxCode = typeof product.tax_code === "string" ? product.tax_code : product.tax_code?.id;
    if (taxCode !== TAX_CODE) {
      await stripe.products.update(product.id, { tax_code: TAX_CODE });
      console.log(`set tax code ${TAX_CODE} on ${product.id}`);
    }
  } else {
    const product = await stripe.products.create(
      {
        name: "It Got Sued Pro",
        description:
          "Full access: lawsuit summaries, who qualifies, claim links and deadlines, court filings, photo and bank scans, My Items, and brand alerts.",
        tax_code: TAX_CODE,
        metadata: { app: "itgotsued", plan: "pro" },
      },
      { idempotencyKey: "itgotsued-pro-product-v2" },
    );
    price = await stripe.prices.create(
      {
        product: product.id,
        unit_amount: 500,
        currency: "usd",
        recurring: { interval: "month" },
        lookup_key: PRO_PRICE_LOOKUP_KEY,
        nickname: "Pro monthly",
        metadata: { app: "itgotsued", plan: "pro" },
      },
      { idempotencyKey: "itgotsued-pro-price-v1" },
    );
    console.log(`created product ${product.id} and price ${price.id} ($5.00/month, ${mode} mode)`);
  }

  const portals = await stripe.billingPortal.configurations.list({ is_default: true, limit: 1 });
  if (portals.data.length) {
    console.log(`customer portal already configured (${portals.data[0].id})`);
  } else {
    const portal = await stripe.billingPortal.configurations.create({
      business_profile: { headline: "Manage your It Got Sued subscription" },
      features: {
        invoice_history: { enabled: true },
        payment_method_update: { enabled: true },
        customer_update: { enabled: true, allowed_updates: ["email"] },
        subscription_cancel: { enabled: true, mode: "at_period_end" },
      },
    });
    console.log(`created customer portal configuration ${portal.id}`);
  }

  console.log(`\nOptional: add STRIPE_PRICE_ID=${price.id} to .env.local (otherwise it is looked up by key).`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
