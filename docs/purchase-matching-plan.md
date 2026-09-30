# Plan: matching purchases to class definitions

Status: proposal. Nothing here is built except where noted.

## Problem

The bank scan (`src/lib/plaid/`) turns transactions into merchant names and matches those
to brands. A brand match says "this company was sued". It does not say "you are in the
class". Class definitions add three conditions the scan ignores:

- **When**: the class period, e.g. "purchased between January 1, 2020 and June 30, 2025".
- **Where**: the states the class is limited to (`cases.states`, already extracted).
- **What**: a product the merchant sold, when the merchant is only a retailer. Bank data
  cannot show products.

## Match tiers

Each case-to-user match gets one of three tiers. The UI shows the tier, never a
guarantee.

| Tier | Signal | Example | Label |
|---|---|---|---|
| Direct | The user paid the defendant, inside the class period, in a class state | Spotify auto-renew suit, Spotify charge in 2023 | "You likely qualify" |
| Retail | The user paid a retailer that sells the defendant's product | Dry shampoo suit, Target charge | "Did you buy X?" (one-tap confirm) |
| Brand only | The brand matches, but the purchase is outside the period, or there is no purchase signal | Data breach, pixel-tracking suit | "You may qualify" |

Retail matches depend on the user's answer. Many product settlements pay without a
receipt (see "Proof of purchase" below), so "yes, I bought it" is often enough to file.

## 1. Class period extraction

`ComplaintAnalysis.class_definition.class_period` already exists as free text in
`complaint_analyses.analysis`. It is not structured, and settlement class periods often
differ from the complaint's.

- Migration: add `class_period_start date` and `class_period_end date` to `cases`. A null
  end means "to present" or the settlement date.
- `EnrichmentSchema` (`src/lib/ingest/enrich.ts`): add `class_period_start` and
  `class_period_end` as ISO dates or null. Prefer the settlement class period over the
  complaint's when both are read (enrich now reads up to 2 settlement filings next to the
  complaint).
- `applyEnrichment`: write the dates only when the model returns them, so a later run
  that reads fewer filings does not erase them. This is the same rule as
  `proof_of_purchase`.

## 2. Merchant aliases

Plaid merchant names ("AMZN Mktp", "SQ *BLUE BOTTLE", "SPOTIFY USA") must resolve to one
`brands.normalized` key. Today `src/lib/plaid/detections.ts` and `src/lib/brands/` do
this with rules and `brands.aliases`.

- New table `merchant_aliases`: `(source text, key text, brand_id text, confidence real)`.
  `source` is `plaid_entity`, `plaid_name` or `website`. `key` is Plaid's
  `merchant_entity_id`, the normalized merchant name, or the website domain.
  Natural key and upsert on `(source, key)`.
- Fill it from three places:
  1. Enrich: have the model return the defendant's website domains and billing
     descriptors when filings state them.
  2. Scans: when a user confirms a detected brand, record the anonymous
     `merchant_entity_id` to brand pair. It holds no user data. Upsert, and raise the
     confidence as more scans confirm the same pair.
  3. A seed file of common descriptors, similar to `data/brands.json`.
- Plaid's `merchant_entity_id` and counterparty `website` fields are more stable than
  names. Match on them first.

## 3. Retailer-to-brand table

For retail matches: `retailer_brands (retailer_brand_id, brand_id)`, with the primary key
on both. Seed it with the large retailers (Walmart, Target, Costco, Amazon, CVS,
Walgreens, Kroger) and the consumer-goods brands in `brands`. It is a broad hint, so the
UI always asks the user to confirm.

## 4. Bank scan changes

The privacy design (`docs/privacy-bank-scan.md`) keeps no dates. Class-period matching
needs them, and it can still work without storing any.

- In `toSignal`, keep the transaction date in memory for the length of the scan.
- On the server, reduce the dates to the first and last purchase date per brand. Compare
  them with each case's class period, then drop them. Send back only the tier for each
  case. Dates never leave the server.
- Update `docs/privacy-bank-scan.md` to say dates are used, in memory, only to check
  class periods.
- Plaid gives at most 24 months of history (`DAYS_REQUESTED = 730`). A class period that
  ended earlier cannot be confirmed from the bank. Show "brand only", not "no match".
- `BANK_FEES` transactions are excluded today. Suits about bank overdraft and NSF fees
  are a large category. Consider keeping the bank itself as a detection when fee
  transactions appear, without keeping the amounts.

## 5. Sources with product data

Bank data stops at the merchant. These sources can show the product:

- Receipt photo scan (the `receipt` DetectionSource already exists).
- Gmail receipt parsing (order confirmation emails). It needs OAuth consent and has its
  own privacy review.
- Amazon order-history export (a CSV the user uploads).

## Proof of purchase (built)

`cases.proof_of_purchase` (`not_required`, `required`, `unknown`) and
`cases.no_proof_payout` come from the settlement filings (migration
`010_proof_of_purchase.sql`). Enrich reads up to 2 stored settlement filings next to the
complaint to find the claim terms. Open claims that pay without a receipt show a
"No proof of purchase needed" badge on case cards, rows and the case page. The claim
panel shows what a claim without a receipt pays, and the claims-open email says so too.

## Rules that do not change

- We never file claims and never pre-fill "I purchased" attestations. The user decides
  whether they qualify and files on the administrator's site.
- Match labels say "likely" or "may". They never say "you qualify".
