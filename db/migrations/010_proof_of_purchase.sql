-- Whether a settlement pays class members who have no receipt or other proof of purchase.
-- Read from settlement filings by enrichment (src/lib/ingest/enrich.ts). 'unknown' until a
-- filing states the claim terms.
ALTER TABLE cases
  ADD COLUMN proof_of_purchase text NOT NULL DEFAULT 'unknown'
    CHECK (proof_of_purchase IN ('not_required', 'required', 'unknown')),
  ADD COLUMN no_proof_payout text;                  -- what a claim without proof pays, e.g. "$5 per product, up to $25"
