import type { Metadata } from "next";
import { MyItems } from "@/components/myitems/MyItems";
import { pageMetadata } from "@/lib/seo";
import { isSubscriber } from "@/lib/auth/session";
import { Paywall } from "@/components/Paywall";

export const metadata: Metadata = pageMetadata({
  title: "My Items",
  description:
    "Keep a list of what you own on your device and check it against active class action lawsuits.",
  path: "/my-items",
  // Personal, device-only list: nothing here for search engines.
  noindex: true,
});

export default async function MyItemsPage() {
  const paid = await isSubscriber();
  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <p className="text-sm font-bold text-muted">Saved on this device</p>
        <h1 className="text-4xl font-extrabold sm:text-5xl">
          My Items
        </h1>
        <p className="max-w-2xl text-lg text-muted">
          List the products, apps, and services you use. We check them against active lawsuits —
          ones that are filed, certified, awaiting settlement approval, or open for claims.
        </p>
      </header>
      {paid ? <MyItems /> : <Paywall feature="Check your items against every lawsuit" next="/my-items" />}
    </div>
  );
}
