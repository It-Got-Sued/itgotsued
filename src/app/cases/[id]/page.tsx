import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getCase } from "@/lib/repo/cases";
import { normalizeBrandKey } from "@/lib/repo/brands";
import { StatusBadge } from "@/components/StatusBadge";
import { SampleBadge, SampleBanner } from "@/components/SampleBadge";
import { STATUS_INFO, TONE_ACCENT, TONE_CLASSES, TONE_DOT } from "@/components/status";
import { Reveal } from "@/components/motion";
import { formatDate, safeUrl } from "@/components/format";
import { Disclaimer } from "@/components/Disclaimer";
import { ApplyPanel } from "@/components/case/ApplyPanel";
import { ComplaintAnalysis } from "@/components/case/ComplaintAnalysis";
import { ComplaintViewer } from "@/components/case/ComplaintViewer";
import { DocketTable } from "@/components/case/DocketTable";
import { FollowBrand } from "@/components/case/FollowBrand";
import { SITE_NAME, SITE_URL, jsonLd, pageMetadata } from "@/lib/seo";
import type { CaseDetail } from "@/lib/types";

type Props = { params: Promise<{ id: string }> };

const loadCase = cache(async (id: string) => {
  const found = await getCase(id);
  if (found) return found;
  try {
    const decoded = decodeURIComponent(id);
    return decoded !== id ? await getCase(decoded) : null;
  } catch {
    return null;
  }
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const c = await loadCase(id);
  if (!c) return { title: "Case not found", robots: { index: false } };
  const status = STATUS_INFO[c.status] ?? STATUS_INFO.unknown;
  const filed = formatDate(c.dateFiled);
  const fallback =
    `${c.caseName}${filed ? `, filed ${filed}` : ""} in ${c.court}. Status: ${status.label}.` +
    (c.brands.length ? ` Brands named: ${c.brands.slice(0, 3).join(", ")}.` : "") +
    " See who qualifies and how to file a claim.";
  return pageMetadata({
    // Short case names have room for the search phrase people actually type.
    title: c.caseName.length <= 26 ? `${c.caseName} Class Action Lawsuit` : c.caseName,
    description: c.summary ?? fallback,
    path: `/cases/${encodeURIComponent(c.id)}`,
    type: "article",
    noindex: c.isSample,
  });
}

function caseStructuredData(c: CaseDetail, description: string) {
  const url = `${SITE_URL}/cases/${encodeURIComponent(c.id)}`;
  return [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: "Class action lawsuits", item: `${SITE_URL}/cases` },
        { "@type": "ListItem", position: 3, name: c.caseName, item: url },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: c.caseName,
      url,
      description,
      ...(c.updatedAt ? { dateModified: c.updatedAt } : {}),
      ...(c.brands.length ? { about: c.brands.map((name) => ({ "@type": "Organization", name })) } : {}),
      isPartOf: { "@type": "WebSite", name: SITE_NAME, url: `${SITE_URL}/` },
    },
  ];
}

export default async function CasePage({ params }: Props) {
  const { id } = await params;
  const c = await loadCase(id);
  if (!c) notFound();

  const status = STATUS_INFO[c.status] ?? STATUS_INFO.unknown;
  const sourceUrl = safeUrl(c.sourceUrl);
  const facts: [string, React.ReactNode][] = [
    ["Court", c.court],
    ["Docket number", c.docketNumber],
    ["Filed", formatDate(c.dateFiled)],
    ["Nature of suit", c.natureOfSuit],
    ["States", c.states.length ? c.states.join(", ") : null],
    ["Categories", c.categories.length ? c.categories.join(", ") : null],
  ];

  return (
    <article className="space-y-8">
      {!c.isSample && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={jsonLd(caseStructuredData(c, c.summary ?? status.explanation))}
        />
      )}
      {c.isSample && <SampleBanner />}

      <Reveal>
        <header className="card relative overflow-hidden p-6 shadow-hard sm:p-10">
          <div aria-hidden className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${TONE_ACCENT[status.tone]}`} />
          <div className="relative space-y-4">
            <Link href="/cases" className="inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-primary">
              <span aria-hidden>←</span> All lawsuits
            </Link>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={c.status} />
              {c.isSample && <SampleBadge />}
            </div>
            <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl">{c.caseName}</h1>
            <dl className="grid gap-3 pt-2 sm:grid-cols-2 lg:grid-cols-3">
              {facts
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k} className="rounded-2xl border border-border bg-surface/70 px-4 py-3">
                    <dt className="text-sm font-semibold text-muted">{k}</dt>
                    <dd className="mt-0.5 font-semibold">{v}</dd>
                  </div>
                ))}
            </dl>
          </div>
        </header>
      </Reveal>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-8">
          <Reveal as="section">
            <section aria-labelledby="status-heading" className={`rounded-3xl p-6 ${TONE_CLASSES[status.tone]}`}>
              <h2 id="status-heading" className="flex items-center gap-2 text-lg font-bold">
                <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${TONE_DOT[status.tone]}`} />
                What &ldquo;{status.label}&rdquo; means
              </h2>
              <p className="mt-2 text-sm leading-relaxed">{status.explanation}</p>
            </section>
          </Reveal>

          <Reveal as="section" className="card p-6 sm:p-8">
            <h2 id="summary-heading" className="text-2xl font-bold">Summary</h2>
            <p className="mt-3 whitespace-pre-line leading-relaxed">
              {c.summary ?? "A plain-language summary isn't available yet."}
            </p>
            <h2 id="qualify-heading" className="mt-8 text-2xl font-bold">Who qualifies</h2>
            <p className="mt-3 whitespace-pre-line leading-relaxed">
              {c.whoQualifies ?? "The class definition hasn't been summarized yet. Check the complaint below."}
            </p>
            {c.brands.length > 0 && (
              <>
                <h2 id="brands-heading" className="mt-8 text-2xl font-bold">Brands named</h2>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {c.brands.map((b) => (
                    <li key={b}>
                      <Link
                        href={`/cases?brand=${encodeURIComponent(normalizeBrandKey(b))}`}
                        className="chip min-h-11 px-4 hover:-translate-y-0.5 hover:border-primary/50 hover:text-primary"
                      >
                        {b}
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Reveal>

          {c.complaintAnalysis?.analysis && (
            <Reveal>
              <ComplaintAnalysis record={c.complaintAnalysis} />
            </Reveal>
          )}

          <Reveal>
            <ComplaintViewer url={safeUrl(c.complaintUrl)} />
          </Reveal>

          <Reveal>
            <DocketTable entries={c.docketEntries} />
          </Reveal>

          <section aria-labelledby="source-heading" className="space-y-1 text-sm">
            <h2 id="source-heading" className="font-semibold">Source</h2>
            <p>
              {sourceUrl ? (
                <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="link">
                  View on {c.source === "courtlistener" ? "CourtListener" : "the original source"}
                </a>
              ) : (
                <span className="text-muted">Source: {c.source}</span>
              )}
              {" · "}
              <span className="text-muted">Last checked {formatDate(c.lastChecked) ?? "—"}</span>
            </p>
          </section>

          <Disclaimer />
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <ApplyPanel c={c} />
          <div className="card p-6">
            <FollowBrand brands={c.brands} />
          </div>
        </aside>
      </div>
    </article>
  );
}
