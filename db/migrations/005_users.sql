-- Accounts, sessions, password resets and the $5/month Stripe subscription.
-- Emails are stored lowercased and trimmed, so the UNIQUE constraint is case-insensitive in practice.
-- Passwords are only ever stored as argon2id hashes (src/lib/auth/password.ts).

CREATE TABLE users (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email                  text NOT NULL UNIQUE CHECK (email = lower(btrim(email))),
  password_hash          text NOT NULL,
  display_name           text,
  is_admin               boolean NOT NULL DEFAULT false,
  -- Stripe billing, kept in sync by /api/stripe/webhook.
  stripe_customer_id     text UNIQUE,
  stripe_subscription_id text UNIQUE,
  subscription_status    text NOT NULL DEFAULT 'none',   -- none | Stripe status (active, trialing, past_due, canceled, ...)
  current_period_end     timestamptz,
  cancel_at_period_end   boolean NOT NULL DEFAULT false,
  last_login_at          timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER users_touch BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Login sessions. id is the sha256 of the cookie token, so a leaked table cannot be replayed.
CREATE TABLE sessions (
  id         text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sessions_user_idx    ON sessions (user_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

-- One-time password reset links. token_hash is the sha256 of the emailed token.
CREATE TABLE password_resets (
  token_hash text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX password_resets_user_idx ON password_resets (user_id);

-- Stripe webhook events already processed, so retries are ignored.
CREATE TABLE stripe_events (
  id           text PRIMARY KEY,
  type         text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);
