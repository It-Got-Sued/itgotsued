import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth/AuthForms";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Reset Your Password",
  description: "Get a link to reset your It Got Sued password.",
  path: "/forgot-password",
  noindex: true,
});

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto max-w-md space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Forgot your password?</h1>
        <p className="text-muted">Enter your account email and we&apos;ll send you a reset link.</p>
      </header>
      <div className="card p-6">
        <ForgotPasswordForm />
      </div>
    </div>
  );
}
