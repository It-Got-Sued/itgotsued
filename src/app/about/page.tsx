import type { Metadata } from "next";
import Link from "next/link";
import { Disclaimer } from "@/components/Disclaimer";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "How We Track Class Action Lawsuits",
  description:
    "How It Got Sued tracks U.S. class action lawsuits from federal court dockets, matches them to the brands you own, and links to official claim sites.",
  path: "/about",
});

export default function AboutPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">About It Got Sued</h1>
      <p>
        Most people never hear about the class actions that include them. Existing sites list a
        few hand-picked settlements and leave you to figure out which apply. We index class
        actions from U.S. court dockets — including cases years before any settlement — and match
        them to what you actually own.
      </p>
      <h2 className="text-xl font-bold">How it works</h2>
      <ol className="list-decimal space-y-1 pl-5">
        <li>Tell us what you own: type it, snap a photo, or optionally scan your bank transactions.</li>
        <li>Confirm the brands we found.</li>
        <li>See every lawsuit that names those brands — including parent companies.</li>
        <li>When a claim form is open, we link you to the official settlement site to apply.</li>
      </ol>
      <p>
        Cases come from public court records such as CourtListener and PACER. Summaries are
        written with AI and may contain mistakes — always check the court documents and the
        official settlement notice.
      </p>
      <p>
        <Link href="/privacy" className="link">How we handle your data</Link>
      </p>
      <Disclaimer />
    </div>
  );
}
