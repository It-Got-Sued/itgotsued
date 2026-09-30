import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignupForm } from "@/components/auth/AuthForms";
import { safeNext } from "@/lib/auth/redirect";
import { getCurrentUser } from "@/lib/auth/session";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Create an Account",
  description: "Create an It Got Sued account to unlock lawsuit details, claim links, scanning, and alerts.",
  path: "/signup",
  noindex: true,
});

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getCurrentUser()) redirect(safeNext(next, "/account"));
  return (
    <div className="mx-auto max-w-md space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Create your account</h1>
        <p className="text-muted">
          Then subscribe for $5/month to see who qualifies, where to file claims, and scan what you own.
        </p>
      </header>
      <div className="card p-6">
        <SignupForm next={next} />
      </div>
    </div>
  );
}
