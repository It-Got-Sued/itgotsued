import type { Metadata } from "next";
import { Scanner } from "@/components/scan/Scanner";
import { pageMetadata } from "@/lib/seo";
import { getTier } from "@/lib/auth/session";
import { Paywall } from "@/components/Paywall";

export const metadata: Metadata = pageMetadata({
  title: "Scan What You Own for Class Action Lawsuits",
  description:
    "Describe, photograph, or bank-scan what you own. It Got Sued finds class action lawsuits that name those brands and shows where to file a claim.",
  path: "/scan",
});

export default async function ScanPage() {
  const tier = await getTier();
  return (
    <div className="space-y-4">
      {tier !== "anonymous" ? (
        <Scanner headingLevel={1} tier={tier} />
      ) : (
        <>
          <h1 className="text-4xl font-extrabold sm:text-5xl">Scan what you own</h1>
          <Paywall min="free" feature="Scan what you own for lawsuits" next="/scan" />
        </>
      )}
    </div>
  );
}
