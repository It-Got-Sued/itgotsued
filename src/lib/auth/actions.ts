"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { sendEmail } from "@/lib/email";
import {
  consumePasswordReset,
  createPasswordReset,
  createUser,
  getUserByEmailWithHash,
  setPasswordHash,
  touchLastLogin,
} from "@/lib/repo/users";
import { burnPasswordCheck, hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from "./password";
import { safeNext } from "./redirect";
import { createSession, deleteAllSessions, deleteSession, newToken, sha256 } from "./session";

export type FormState = { error?: string; message?: string; email?: string } | undefined;

const Email = z.string().trim().max(254).pipe(z.email("Enter a valid email address."));
const NewPassword = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
  .max(200, "Use at most 200 characters.");

const RESET_MINUTES = 60;

export async function signup(_prev: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "");
  const parsed = z.object({ email: Email, password: NewPassword }).safeParse({
    email,
    password: form.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message, email };

  const user = await createUser(parsed.data.email, await hashPassword(parsed.data.password));
  if (!user) return { error: "An account with that email already exists. Try signing in.", email };

  await createSession(user.id);
  await touchLastLogin(user.id);
  redirect(safeNext(form.get("next"), "/account?welcome=1"));
}

export async function login(_prev: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password.", email };

  const found = await getUserByEmailWithHash(email);
  if (!found) {
    await burnPasswordCheck(password);
    return { error: "Email or password is incorrect.", email };
  }
  if (!(await verifyPassword(found.passwordHash, password))) {
    return { error: "Email or password is incorrect.", email };
  }

  await createSession(found.user.id);
  await touchLastLogin(found.user.id);
  redirect(safeNext(form.get("next"), "/account"));
}

export async function logout(): Promise<void> {
  await deleteSession();
  redirect("/");
}

export async function requestPasswordReset(_prev: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "");
  const parsed = Email.safeParse(email);
  if (!parsed.success) return { error: parsed.error.issues[0].message, email };

  // Same response whether or not the account exists, so this form cannot be used to probe emails.
  const done = { message: "If that email has an account, a reset link is on its way. It expires in 1 hour." };

  const found = await getUserByEmailWithHash(parsed.data);
  if (!found) return done;

  const token = newToken();
  await createPasswordReset(sha256(token), found.user.id, new Date(Date.now() + RESET_MINUTES * 60_000));
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  try {
    await sendEmail(
      found.user.email,
      "Reset your It Got Sued password",
      `Someone asked to reset the password for your It Got Sued account.\n\n` +
        `Reset it here (link expires in 1 hour):\n${base}/reset-password?token=${token}\n\n` +
        `If this wasn't you, ignore this email. Your password won't change.`,
    );
  } catch (err) {
    console.error("[auth] reset email failed:", err instanceof Error ? err.message : err);
    return { error: "We couldn't send the email. Please try again in a minute." };
  }
  return done;
}

export async function resetPassword(_prev: FormState, form: FormData): Promise<FormState> {
  const token = String(form.get("token") ?? "");
  const password = NewPassword.safeParse(form.get("password"));
  if (!password.success) return { error: password.error.issues[0].message };
  if (!token) return { error: "This reset link is invalid. Request a new one." };

  const userId = await consumePasswordReset(sha256(token));
  if (!userId) return { error: "This reset link is invalid or has expired. Request a new one." };

  await setPasswordHash(userId, await hashPassword(password.data));
  await deleteAllSessions(userId); // sign out every other device
  await createSession(userId);
  redirect("/account?reset=1");
}
