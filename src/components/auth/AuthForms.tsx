"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  login,
  requestPasswordReset,
  resetPassword,
  signup,
  type FormState,
} from "@/lib/auth/actions";
import { Alert } from "../Alert";

const MIN_PASSWORD_LENGTH = 10;

function Field({
  id,
  label,
  hint,
  ...input
}: { id: string; label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">{label}</label>
      <input id={id} name={id} className="input" aria-describedby={hint ? `${id}-hint` : undefined} {...input} />
      {hint && <p id={`${id}-hint`} className="mt-1 text-sm text-muted">{hint}</p>}
    </div>
  );
}

function Status({ state }: { state: FormState }) {
  if (state?.error) return <Alert>{state.error}</Alert>;
  if (state?.message) return <Alert tone="success">{state.message}</Alert>;
  return null;
}

export function SignupForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(signup, undefined);
  return (
    <form action={action} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      <Field id="email" label="Email" type="email" required autoComplete="email" defaultValue={state?.email} />
      <Field
        id="password"
        label="Password"
        type="password"
        required
        minLength={MIN_PASSWORD_LENGTH}
        autoComplete="new-password"
        hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
      />
      <Status state={state} />
      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </button>
      <p className="text-sm text-muted">
        Already have an account?{" "}
        <Link className="link" href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}>Sign in</Link>
      </p>
    </form>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      <Field id="email" label="Email" type="email" required autoComplete="email" defaultValue={state?.email} />
      <Field id="password" label="Password" type="password" required autoComplete="current-password" />
      <Status state={state} />
      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <div className="flex flex-wrap justify-between gap-2 text-sm text-muted">
        <Link className="link" href="/forgot-password">Forgot password?</Link>
        <span>
          New here?{" "}
          <Link className="link" href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"}>Create an account</Link>
        </span>
      </div>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, undefined);
  return (
    <form action={action} className="space-y-4">
      <Field id="email" label="Email" type="email" required autoComplete="email" defaultValue={state?.email} />
      <Status state={state} />
      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? "Sending…" : "Email me a reset link"}
      </button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPassword, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <Field
        id="password"
        label="New password"
        type="password"
        required
        minLength={MIN_PASSWORD_LENGTH}
        autoComplete="new-password"
        hint={`At least ${MIN_PASSWORD_LENGTH} characters. Signs you out on other devices.`}
      />
      <Status state={state} />
      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? "Saving…" : "Set new password"}
      </button>
    </form>
  );
}
