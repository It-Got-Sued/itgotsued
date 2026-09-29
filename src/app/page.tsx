import Link from "next/link";
import { connection } from "next/server";
import { searchCases } from "@/lib/repo/cases";
import { listBrands } from "@/lib/repo/brands";
import type { CaseSearchResult } from "@/lib/types";
import { Scanner } from "@/components/scan/Scanner";
import { SearchBox } from "@/components/SearchBox";
import { CaseList } from "@/components/CaseCard";
import { Alert } from "@/components/Alert";
import { HeroVisual } from "@/components/HeroVisual";
import { IconBank, IconCamera, IconList, IconPencil, IconShield } from "@/components/icons";

const QUICK_FILTERS = [
  { status: "claims_open", label: "Claims open now" },
  { status: "settlement_pending", label: "Settlement pending" },
  { status: "certified", label: "Class certified" },
  { status: "filed", label: "Newly filed" },
];

// Ways to tell us what you own. These are alternatives, not steps, so they are not numbered.
const WAYS = [
  {
    icon: <IconPencil size={22} />,
    title: "Type it",
    body: "List what you use: toothpaste, phone plan, vitamins, streaming apps.",
  },
  {
    icon: <IconCamera size={22} />,
    title: "Snap it",
    body: "Photograph a shelf or pantry. We read the brand labels for you.",
  },
  {
    icon: <IconBank size={22} />,
    title: "Scan your bank",
    body: "Optional and read-only. Nothing is stored, and the connection is removed right after.",
  },
  {
    icon: <IconList size={22} />,
    title: "Keep a list",
    body: "My Items re-checks the docket each visit, so new lawsuits find you.",
  },
];

async function loadHome(): Promise<{
  open: CaseSearchResult | null;
  totalCases: number;
  totalBrands: number;
}> {
  await connection();
  try {
    return {
      open: searchCases({ status: "claims_open", pageSize: 6 }),
      totalCases: searchCases({ pageSize: 1 }).total,
      totalBrands: listBrands().length,
    };
  } catch {
    return { open: null, totalCases: 0, totalBrands: 0 };
  }
}

export default async function Home() {
  const { open, totalCases, totalBrands } = await loadHome();

  return (
    <div className="space-y-20 sm:space-y-28">
      {/* ---------- Hero ---------- */}
      <section className="grid items-center gap-12 pt-2 lg:grid-cols-[1.1fr_1fr] lg:gap-8">
        <div className="space-y-7">
          <h1 className="text-5xl leading-[1.02] sm:text-6xl lg:text-7xl">
            Find out if your stuff got sued.
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-muted sm:text-xl">
            Tell us what you own, in words, with a photo, or from your bank transactions. We show
            every lawsuit that names those brands, and where to file a claim when one opens.
          </p>
          <div className="flex flex-wrap gap-3">
            <a href="#scan" className="btn-primary px-7 text-lg">
              Check my stuff
            </a>
            <Link href="/cases" className="btn-secondary px-7 text-lg">
              Browse lawsuits
            </Link>
          </div>
          {totalCases > 0 && (
            <p className="text-[0.95rem] font-semibold text-muted">
              <span className="text-foreground">{totalCases.toLocaleString()}</span> lawsuits
              indexed, <span className="text-foreground">{(open?.total ?? 0).toLocaleString()}</span>{" "}
              with claims open, across{" "}
              <span className="text-foreground">{totalBrands.toLocaleString()}</span> brands.
            </p>
          )}
        </div>
        <HeroVisual />
      </section>

      {/* ---------- Scanner ---------- */}
      <div id="scan" className="scroll-mt-24">
        <Scanner />
      </div>

      {/* ---------- Ways to check ---------- */}
      <section aria-labelledby="ways-heading" className="space-y-8">
        <h2 id="ways-heading" className="max-w-2xl text-3xl sm:text-4xl">
          You don&apos;t need to know which lawsuits apply to you.
        </h2>
        <ul className="grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {WAYS.map((w) => (
            <li key={w.title} className="space-y-3">
              <span className="grid h-12 w-12 place-items-center rounded-full border-2 border-border bg-sticker text-[#17175c]">
                {w.icon}
              </span>
              <h3 className="text-xl">{w.title}</h3>
              <p className="text-muted">{w.body}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------- Search band ---------- */}
      <section
        aria-labelledby="search-heading"
        className="mx-[calc(50%-50vw)] border-y-2 border-[#17175c] bg-sticker px-4 py-14 text-[#17175c] sm:px-6 sm:py-20"
      >
        <div className="mx-auto max-w-6xl space-y-6">
          <h2 id="search-heading" className="text-4xl sm:text-5xl">
            Search every lawsuit.
          </h2>
          <p className="max-w-xl text-lg font-medium">
            Company, product, or case name. We search the full federal docket, not only
            settlements.
          </p>
          <div className="max-w-2xl [&_.input]:border-[#17175c] [&_.input]:bg-white [&_.input]:text-[#17175c] [&_.input:focus]:shadow-[4px_4px_0_#17175c]">
            <SearchBox />
          </div>
          <nav aria-label="Quick filters">
            <ul className="flex flex-wrap gap-2">
              {[...QUICK_FILTERS.map((f) => ({ href: `/cases?status=${f.status}`, label: f.label })), { href: "/my-items", label: "My Items" }].map((f) => (
                <li key={f.href}>
                  <Link
                    href={f.href}
                    className="inline-flex min-h-11 items-center rounded-full border-2 border-[#17175c] bg-white/60 px-4 text-[0.95rem] font-semibold transition-colors hover:bg-white"
                  >
                    {f.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </section>

      {/* ---------- Claims open ---------- */}
      <section aria-labelledby="open-heading" className="space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="open-heading" className="text-3xl sm:text-4xl">
              Claims open now
            </h2>
            <p className="mt-2 text-muted">Settlements accepting claims, soonest deadline first.</p>
          </div>
          {open && open.total > 0 && (
            <Link href="/cases?status=claims_open" className="btn-secondary">
              See all {open.total}
            </Link>
          )}
        </div>
        {open === null ? (
          <Alert>Open claims didn&apos;t load. Refresh the page to try again.</Alert>
        ) : open.cases.length === 0 ? (
          <p className="text-muted">No settlements are accepting claims right now. Check back soon.</p>
        ) : (
          <CaseList cases={open.cases} />
        )}
      </section>

      {/* ---------- Privacy promise ---------- */}
      <section className="flex flex-col items-start gap-5 rounded-2xl border-2 border-border p-6 sm:flex-row sm:items-center sm:p-8">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full border-2 border-border bg-mint text-[#062b1a]">
          <IconShield size={26} />
        </span>
        <div className="flex-1">
          <h2 className="text-2xl">Your stuff stays yours</h2>
          <p className="mt-1 text-muted">
            No account needed to scan. Photos and transactions are processed in memory and never
            stored. Your My Items list lives on your device.
          </p>
        </div>
        <Link href="/privacy" className="btn-secondary">
          How we handle data
        </Link>
      </section>
    </div>
  );
}
