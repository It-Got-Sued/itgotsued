import { query, queryOne } from "@/lib/db";

export type User = {
  id: string;
  email: string;
  displayName: string | null;
  isAdmin: boolean;
  tierType: "free" | "pro";
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

type Row = Record<string, unknown>;

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : ((v as string) ?? null));

export function toUser(r: Row): User {
  return {
    id: r.id as string,
    email: r.email as string,
    displayName: (r.display_name as string) ?? null,
    isAdmin: r.is_admin as boolean,
    tierType: r.tier_type as "free" | "pro",
    stripeCustomerId: (r.stripe_customer_id as string) ?? null,
    stripeSubscriptionId: (r.stripe_subscription_id as string) ?? null,
    subscriptionStatus: r.subscription_status as string,
    currentPeriodEnd: iso(r.current_period_end),
    cancelAtPeriodEnd: r.cancel_at_period_end as boolean,
    lastLoginAt: iso(r.last_login_at),
    createdAt: iso(r.created_at) as string,
  };
}

/** Whether the user pays for Pro through Stripe. Admins get Pro without a subscription. */
export function hasActiveSubscription(user: User | null): boolean {
  return user?.subscriptionStatus === "active" || user?.subscriptionStatus === "trialing";
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Emails listed in ADMIN_EMAILS (comma-separated) become admins when they sign up.
function isAdminEmail(email: string): boolean {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map(normalizeEmail)
    .filter(Boolean)
    .includes(email);
}

/** Create an account. Returns null when the email is already registered. */
export async function createUser(email: string, passwordHash: string): Promise<User | null> {
  const normalized = normalizeEmail(email);
  const r = await queryOne(
    `INSERT INTO users (email, password_hash, is_admin) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO NOTHING
     RETURNING *`,
    [normalized, passwordHash, isAdminEmail(normalized)],
  );
  return r ? toUser(r) : null;
}

export async function getUserByEmailWithHash(
  email: string,
): Promise<{ user: User; passwordHash: string } | null> {
  const r = await queryOne("SELECT * FROM users WHERE email = $1", [normalizeEmail(email)]);
  return r ? { user: toUser(r), passwordHash: r.password_hash as string } : null;
}

export async function getUserById(id: string): Promise<User | null> {
  const r = await queryOne("SELECT * FROM users WHERE id = $1", [id]);
  return r ? toUser(r) : null;
}

export async function touchLastLogin(id: string): Promise<void> {
  await query("UPDATE users SET last_login_at = now() WHERE id = $1", [id]);
}

export async function setPasswordHash(id: string, passwordHash: string): Promise<void> {
  await query("UPDATE users SET password_hash = $2 WHERE id = $1", [id, passwordHash]);
}

export async function setStripeCustomerId(id: string, customerId: string): Promise<void> {
  await query("UPDATE users SET stripe_customer_id = $2 WHERE id = $1", [id, customerId]);
}

export type SubscriptionSync = {
  customerId: string;
  subscriptionId: string;
  status: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
};

/** Apply a Stripe subscription snapshot to the user who owns the customer. */
export async function syncSubscription(s: SubscriptionSync): Promise<boolean> {
  const rows = await query(
    `UPDATE users SET stripe_subscription_id = $2, subscription_status = $3,
       current_period_end = $4, cancel_at_period_end = $5
     WHERE stripe_customer_id = $1
     RETURNING id`,
    [s.customerId, s.subscriptionId, s.status, s.currentPeriodEnd, s.cancelAtPeriodEnd],
  );
  return rows.length > 0;
}

export async function listUsers(limit = 500): Promise<User[]> {
  return (await query("SELECT * FROM users ORDER BY created_at DESC LIMIT $1", [limit])).map(toUser);
}

// --- Password resets ---

export async function createPasswordReset(tokenHash: string, userId: string, expiresAt: Date): Promise<void> {
  await query(
    `INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES ($1, $2, $3)
     ON CONFLICT (token_hash) DO NOTHING`,
    [tokenHash, userId, expiresAt],
  );
}

/** Mark a reset token used and return its user id, or null if unknown, used, or expired. */
export async function consumePasswordReset(tokenHash: string): Promise<string | null> {
  const r = await queryOne<{ user_id: string }>(
    `UPDATE password_resets SET used_at = now()
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
     RETURNING user_id`,
    [tokenHash],
  );
  return r?.user_id ?? null;
}

// --- Stripe webhook idempotency ---

/** Record a Stripe event id. Returns false if it was already processed. */
export async function markStripeEvent(id: string, type: string): Promise<boolean> {
  const rows = await query(
    "INSERT INTO stripe_events (id, type) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING RETURNING id",
    [id, type],
  );
  return rows.length > 0;
}

export async function unmarkStripeEvent(id: string): Promise<void> {
  await query("DELETE FROM stripe_events WHERE id = $1", [id]);
}
