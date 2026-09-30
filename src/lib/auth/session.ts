import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { query, queryOne } from "@/lib/db";
import { getUserById, hasActiveSubscription, type User } from "@/lib/repo/users";

// Opaque random session tokens in an httpOnly cookie. The database stores only their sha256,
// so sessions can be revoked server-side (log out, password reset) and a leaked table cannot be replayed.

const COOKIE = "igs_session";
const SESSION_DAYS = 30;

export function sha256(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Start a session for `userId` and set the cookie. Call from a Server Action or Route Handler. */
export async function createSession(userId: string): Promise<void> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await query(
    "INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING",
    [sha256(token), userId, expiresAt],
  );
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function deleteSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) await query("DELETE FROM sessions WHERE id = $1", [sha256(token)]);
  store.delete(COOKIE);
}

export async function deleteAllSessions(userId: string): Promise<void> {
  await query("DELETE FROM sessions WHERE user_id = $1", [userId]);
}

/** The signed-in user for this request, or null. Deduplicated per render. */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const s = await queryOne<{ user_id: string }>(
    "SELECT user_id FROM sessions WHERE id = $1 AND expires_at > now()",
    [sha256(token)],
  );
  return s ? getUserById(s.user_id) : null;
});

/** True when the current visitor has an active subscription. */
export async function isSubscriber(): Promise<boolean> {
  return hasActiveSubscription(await getCurrentUser());
}

export async function requireUser(next = "/account"): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}

/** For Route Handlers: a 401/402 response when the caller is not a paying subscriber, else null. */
export async function subscriberOnlyResponse(): Promise<Response | null> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to use this feature." }, { status: 401 });
  if (!hasActiveSubscription(user)) {
    return Response.json({ error: "This feature needs an It Got Sued subscription." }, { status: 402 });
  }
  return null;
}
