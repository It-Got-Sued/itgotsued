-- Each account's tier, derived from admin status and the Stripe subscription so it never drifts.
-- Admins are always pro. Keep in sync with tierOf() in src/lib/tiers.ts.
ALTER TABLE users ADD COLUMN tier_type text NOT NULL GENERATED ALWAYS AS (
  CASE
    WHEN is_admin OR subscription_status IN ('active', 'trialing') THEN 'pro'
    ELSE 'free'
  END
) STORED;
