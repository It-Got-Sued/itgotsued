import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth/AuthForms";
import { Alert } from "@/components/Alert";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Choose a New Password",
  description: "Set a new password for your It Got Sued account.",
  path: "/reset-password",
  noindex: true,
});

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Choose a new password</h1>
      <div className="card p-6">
        {token ? (
          <ResetPasswordForm token={token} />
        ) : (
          <Alert>
            This link is missing its token. <Link className="link" href="/forgot-password">Request a new one</Link>.
          </Alert>
        )}
      </div>
    </div>
  );
}
