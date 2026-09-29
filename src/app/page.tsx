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
import { CountUp, Reveal } from "@/components/motion";
import {
  IconArrowRight,
  IconBank,
  IconCamera,
  IconList,
  IconPencil,
  IconShield,
  IconSparkle,
} from "@/components/icons";

const QUICK_FILTERS = [
  { status: "claims_open", label: "Claims open now", tint: "hover:border-emerald-500/60 hover:text-emerald-600 dark:hover:text-emerald-300" },
  { status: "settlement_pending", label: "Settlement pending", tint: "hover:border-amber-500/60 hover:text-amber-600 dark:hover:text-amber-300" },
  { status: "certified", label: "Class certified", tint: "hover:border-indigo-500/60 hover:text-indigo-600 dark:hover:text-indigo-300" },
  { status: "filed", label: "Newly filed", tint: "hover:border-fuchsia-500/60 hover:text-fuchsia-600 dark:hover:text-fuchsia-300" },
];

const STEPS = [
  {
    icon: <IconPencil size={22} />,
    title: "Describe it",
    body: "Type what you use — toothpaste, phone plan, vitamins, streaming apps.",
    tint: "from-violet-500 to-fuchsia-500",
  },
  {
    icon: <IconCamera size={22} />,
    title: "Snap it",
    body: "Photograph a shelf or pantry. We read the brand labels for you.",
    tint: "from-pink-500 to-orange-400",
  },
  {
    icon: <IconBank size={22} />,
    title: "Connect it",
    body: "Optional read-only bank scan. Nothing stored; connection removed right after.",
    tint: "from-cyan-500 to-indigo-500",
  },
  {
    icon: <IconList size={22} />,
    title: "Keep a list",
    body: "My Items re-checks the docket every visit, so new lawsuits find you.",
    tint: "from-emerald-400 to-teal-500",
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
    <div className="space-y-24">
      {/* ---------- Hero ---------- */}
      <section className="grid items-center gap-10 lg:grid-cols-[1.15fr_1fr]">
        <div className="space-y-7">
          <Reveal>
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3.5 py-1.5 text-xs font-semibold text-primary">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping-slow rounded-full bg-primary" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              Every U.S. class action, one index
            </p>
          </Reveal>
          <Reveal delay={0.05}>
            <h1 className="text-4xl font-extrabold leading-[1.05] sm:text-5xl lg:text-6xl">
              Find the class actions that{" "}
              <span className="animate-gradient-pan text-gradient">owe you</span>.
            </h1>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="max-w-xl text-lg leading-relaxed text-muted">
              Tell us what you own — in words, with a photo, or from your bank transactions — and
              we&apos;ll show every lawsuit that names those brands, plus where to file a claim.
            </p>
          </Reveal>
          <Reveal delay={0.15} className="flex flex-wrap gap-3">
            <a href="#scan" className="btn-primary px-6 text-base">
              <IconSparkle size={18} /> Scan what I own
            </a>
            <Link href="/cases" className="btn-secondary px-6 text-base">
              Browse all lawsuits <IconArrowRight size={18} />
            </Link>
          </Reveal>
          <Reveal delay={0.2}>
            <dl className="grid max-w-lg grid-cols-3 gap-3">
              {[
                { label: "Lawsuits indexed", value: totalCases },
                { label: "Claims open", value: open?.total ?? 0 },
                { label: "Brands tracked", value: totalBrands },
              ].map((s) => (
                <div key={s.label} className="card-glass rounded-2xl px-4 py-3">
                  <dt className="text-xs text-muted">{s.label}</dt>
                  <dd className="font-display text-2xl font-bold">
                    <CountUp value={s.value} className="text-gradient" />
                  </dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
        <HeroVisual />
      </section>

      {/* ---------- How it works ---------- */}
      <section aria-labelledby="how-heading" className="space-y-8">
        <Reveal className="max-w-2xl">
          <h2 id="how-heading" className="text-3xl font-bold sm:text-4xl">
            Four ways to <span className="text-gradient">find your money</span>
          </h2>
          <p className="mt-2 text-muted">
            Other sites make you scroll hand-picked lists. We match the whole federal docket to the
            things you actually own.
          </p>
        </Reveal>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <Reveal key={s.title} as="li" delay={i * 0.08}>
              <div className="card group h-full p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-lift">
                <span
                  className={`mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br ${s.tint} text-white shadow-soft transition-transform duration-300 group-hover:rotate-[-6deg] group-hover:scale-110`}
                >
                  {s.icon}
                </span>
                <h3 className="text-lg font-bold">{s.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted">{s.body}</p>
              </div>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* ---------- Scanner ---------- */}
      <div id="scan" className="scroll-mt-24">
        <Reveal>
          <Scanner />
        </Reveal>
      </div>

      {/* ---------- Search ---------- */}
      <Reveal as="section" className="space-y-5">
        <div className="relative overflow-hidden rounded-3xl bg-brand-gradient p-8 text-white shadow-lift sm:p-12">
          <div aria-hidden className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/15 blur-2xl" />
          <div aria-hidden className="absolute -bottom-20 left-10 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
          <div className="relative space-y-5">
            <h2 id="search-heading" className="text-3xl font-bold sm:text-4xl">
              Search every lawsuit
            </h2>
            <p className="max-w-xl text-white/85">
              Company, product, or case name — we search the full docket, not just settlements.
            </p>
            <div className="max-w-2xl rounded-2xl bg-white/15 p-2 backdrop-blur [&_.input]:border-white/30 [&_.input]:bg-white [&_.input]:text-slate-900">
              <SearchBox />
            </div>
            <nav aria-label="Quick filters">
              <ul className="flex flex-wrap gap-2">
                {QUICK_FILTERS.map((f) => (
                  <li key={f.status}>
                    <Link
                      href={`/cases?status=${f.status}`}
                      className="inline-flex min-h-10 items-center rounded-full border border-white/40 bg-white/10 px-4 text-sm font-medium text-white backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-white hover:text-violet-700"
                    >
                      {f.label}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link
                    href="/my-items"
                    className="inline-flex min-h-10 items-center rounded-full border border-white/40 bg-white/10 px-4 text-sm font-medium text-white backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-white hover:text-violet-700"
                  >
                    My Items
                  </Link>
                </li>
              </ul>
            </nav>
          </div>
        </div>
      </Reveal>

      {/* ---------- Claims open ---------- */}
      <section aria-labelledby="open-heading" className="space-y-6">
        <Reveal className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="open-heading" className="text-3xl font-bold sm:text-4xl">
              Claims <span className="text-gradient">open now</span>
            </h2>
            <p className="mt-1 text-muted">Settlements accepting claims — deadlines first.</p>
          </div>
          {open && open.total > 0 && (
            <Link href="/cases?status=claims_open" className="btn-secondary">
              See all {open.total} <IconArrowRight size={16} />
            </Link>
          )}
        </Reveal>
        {open === null ? (
          <Alert>We couldn&apos;t load open claims right now. Please try again shortly.</Alert>
        ) : open.cases.length === 0 ? (
          <p className="text-muted">No settlements are accepting claims right now. Check back soon.</p>
        ) : (
          <CaseList cases={open.cases} />
        )}
      </section>

      {/* ---------- Privacy promise ---------- */}
      <Reveal as="section" className="card-glass flex flex-col items-start gap-5 p-8 sm:flex-row sm:items-center">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-500 text-white shadow-soft">
          <IconShield size={28} />
        </span>
        <div className="flex-1">
          <h2 className="text-xl font-bold">Privacy is the product</h2>
          <p className="mt-1 text-sm text-muted">
            No account to scan. Photos and transactions are processed in memory and never stored.
            Your My Items list lives on your device.
          </p>
        </div>
        <Link href="/privacy" className="btn-secondary">
          How we handle data
        </Link>
      </Reveal>
    </div>
  );
}
