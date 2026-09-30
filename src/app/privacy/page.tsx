import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Privacy Policy in Plain English",
  description:
    "How It Got Sued handles your photos, bank data, and email, in plain English. No account needed, bank connections removed right after each scan.",
  path: "/privacy",
});

const SECTIONS: { title: string; points: React.ReactNode[] }[] = [
  {
    title: "No account needed",
    points: ["You can search, scan, and check your items without signing up or giving us your name."],
  },
  {
    title: "Photos",
    points: [
      "Your browser shrinks the photo before uploading it.",
      "We send it to an AI vision model only to spot brand names. It is processed in memory and never stored — not by us, and not kept for training.",
      "Only the list of detected brands comes back. You confirm them before anything is searched.",
    ],
  },
  {
    title: "What you type",
    points: [
      "Descriptions you type are used only to pick out brand names, then discarded.",
      "Your My Items list is saved only in your browser on your device. We see the item names only at the moment you check them, and we don't keep them.",
    ],
  },
  {
    title: "Bank scan (optional)",
    points: [
      "Bank scanning uses Plaid with read-only access. We can't move money, and you sign in on Plaid's screen — we never see your bank password.",
      "Transactions are processed in memory to match merchants to brands. They are never stored.",
      "The bank connection is removed as soon as processing finishes.",
      "Only the list of matched brand names is returned to your browser.",
      "Bank data shows merchants, not products: we can tell you shopped at Walmart, not what you bought.",
    ],
  },
  {
    title: "Email alerts",
    points: [
      "If you follow a brand, we store your email address and the brand so we can notify you. That's all we store about you.",
      "Every alert has an unsubscribe link, and you can ask us to delete your email at any time.",
    ],
  },
  {
    title: "What we never do",
    points: [
      "We don't sell your data.",
      "We don't file claims for you or share your information with law firms.",
      "\"Apply\" buttons take you to the official settlement administrator's site; what you submit there is governed by their privacy policy.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="max-w-2xl space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Privacy, in plain English</h1>
        <p className="text-muted">
          Finding lawsuits that apply to you shouldn&apos;t cost you your privacy. Here is exactly what
          happens to your data.
        </p>
      </header>
      {SECTIONS.map((s) => (
        <section key={s.title} className="space-y-2">
          <h2 className="text-xl font-bold">{s.title}</h2>
          <ul className="list-disc space-y-1 pl-5">
            {s.points.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
