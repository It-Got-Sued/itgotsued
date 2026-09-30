import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignupForm } from "@/components/auth/AuthForms";
import { safeNext } from "@/lib/auth/redirect";
import { getCurrentUser } from "@/lib/auth/session";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Create an Account",
  description: "Create a free It Got Sued account for lawsuit summaries, claim deadlines, and scans. Upgrade to Pro anytime.",
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
          Free accounts get lawsuit summaries, claim deadlines, and a few scans a day.{" "}
          {next === "/api/billing/checkout" ? (
            "Next you'll go to secure checkout for Pro."
          ) : (
            <>
              Want everything? <Link className="link" href="/pricing">See Pro</Link>.
            </>
          )}
        </p>
      </header>
      <div className="card p-6">
        <SignupForm next={next} />
      </div>
    </div>
  );
}
