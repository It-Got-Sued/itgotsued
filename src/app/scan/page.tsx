import type { Metadata } from "next";
import { Scanner } from "@/components/scan/Scanner";

export const metadata: Metadata = {
  title: "Scan what you own",
  description: "Describe, photograph, or bank-scan what you own to find class action lawsuits that name those brands.",
};

export default function ScanPage() {
  return (
    <div className="space-y-4">
      <Scanner headingLevel={1} />
    </div>
  );
}
