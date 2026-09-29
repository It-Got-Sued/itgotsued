import type { Metadata } from "next";
import { MyItems } from "@/components/myitems/MyItems";

export const metadata: Metadata = {
  title: "My Items",
  description: "Keep a list of what you own on your device and check it against active class action lawsuits.",
};

export default function MyItemsPage() {
  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wider text-primary">Saved on this device</p>
        <h1 className="text-4xl font-extrabold sm:text-5xl">
          My <span className="animate-gradient-pan text-gradient">Items</span>
        </h1>
        <p className="max-w-2xl text-lg text-muted">
          List the products, apps, and services you use. We check them against active lawsuits —
          ones that are filed, certified, awaiting settlement approval, or open for claims.
        </p>
      </header>
      <MyItems />
    </div>
  );
}
