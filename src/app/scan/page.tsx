import type { Metadata } from "next";
import { Scanner } from "@/components/scan/Scanner";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Scan What You Own for Class Action Lawsuits",
  description:
    "Describe, photograph, or bank-scan what you own. It Got Sued finds class action lawsuits that name those brands and shows where to file a claim.",
  path: "/scan",
});

export default function ScanPage() {
  return (
    <div className="space-y-4">
      <Scanner headingLevel={1} />
    </div>
  );
}
