import type { Metadata } from "next";
import { searchCases } from "@/lib/repo/cases";
import { getBrandByNormalized, listBrands } from "@/lib/repo/brands";
import { CaseRows } from "@/components/CaseRows";
import { lookupAndStoreCases } from "@/lib/ingest/live-lookup";
import { CaseFilters, isProofOfPurchase, type FilterValues } from "@/components/CaseFilters";
import { Pagination } from "@/components/Pagination";
import { isCaseStatus, STATUS_INFO } from "@/components/status";
import { Reveal } from "@/components/motion";
import { CASE_STATUSES } from "@/lib/types";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { getTier } from "@/lib/auth/session";
import { shieldSummary } from "@/lib/paywall";
import { Paywall } from "@/components/Paywall";

const PAGE_SIZE = 20;

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

// Brand and status views are real landing pages ("Amazon class action lawsuits",
// "open class action settlements"), so they keep their own canonical. State filters
// fold into the unfiltered view, and free-text search results are not indexed.
export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }): Promise<Metadata> {
  const sp = await searchParams;
  const status = isCaseStatus(one(sp.status)) ? one(sp.status) : "";
  const brandKey = one(sp.brand).toLowerCase().slice(0, 100);
  const page = Math.max(1, Number.parseInt(one(sp.page), 10) || 1);
  const brand = brandKey ? await getBrandByNormalized(brandKey).catch(() => null) : null;

  const qs = new URLSearchParams();
  if (brand) qs.set("brand", brand.normalized);
  if (status) qs.set("status", status);
  if (page > 1) qs.set("page", String(page));
  const path = qs.size ? `/cases?${qs}` : "/cases";

  const statusLabel = isCaseStatus(status) ? STATUS_INFO[status].label : "";
  const subject = [brand?.name, statusLabel].filter(Boolean).join(" ");
  const title = subject ? `${subject} Class Action Lawsuits` : "All U.S. Class Action Lawsuits";
  const description = brand
    ? `Every class action lawsuit naming ${brand.name}${statusLabel ? ` (${statusLabel.toLowerCase()})` : ""}: court, docket, status, who qualifies, and where to file a claim when one opens.`
    : `Search and filter ${statusLabel ? `${statusLabel.toLowerCase()} ` : ""}U.S. class action lawsuits by brand, state, and status. See who qualifies and where to file a claim.`;

  return pageMetadata({
    title: page > 1 ? `${title} (Page ${page})` : title,
    description,
    path,
    noindex: Boolean(one(sp.q)) || Boolean(one(sp.proof)) || (Boolean(brandKey) && !brand),
  });
}

export default async function CasesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const values: FilterValues = {
    q: one(sp.q).slice(0, 200),
    status: isCaseStatus(one(sp.status)) ? one(sp.status) : "",
    state: /^[A-Za-z]{2}$/.test(one(sp.state)) ? one(sp.state).toUpperCase() : "",
    brand: one(sp.brand).toLowerCase().slice(0, 100),
    proof: isProofOfPurchase(one(sp.proof)) ? one(sp.proof) : "",
  };
  const page = Math.max(1, Number.parseInt(one(sp.page), 10) || 1);

  const params = {
    q: values.q || undefined,
    status: isCaseStatus(values.status) ? values.status : undefined,
    state: values.state || undefined,
    brand: values.brand || undefined,
    proof: isProofOfPurchase(values.proof) ? values.proof : undefined,
    page,
    pageSize: PAGE_SIZE,
  };
  const { result, lookedUpLive } = await (async () => {
    try {
      const first = await searchCases(params);
      // Nothing in our index for a plain text search (e.g. a case name from a settlement
      // email): ask CourtListener directly, store what it finds, and search again.
      if (first.total === 0 && values.q && page === 1 && (await lookupAndStoreCases(values.q)) > 0) {
        return { result: await searchCases(params), lookedUpLive: true };
      }
      return { result: first, lookedUpLive: false };
    } catch {
      return { result: null, lookedUpLive: false };
    }
  })();
  const brands = await (async () => {
    try {
      return (await listBrands()).map((b) => ({ normalized: b.normalized, name: b.name }));
    } catch {
      return null;
    }
  })();

  const tier = await getTier();
  if (result) result.cases = result.cases.map((c) => shieldSummary(c, tier));

  const pageCount = result ? Math.ceil(result.total / PAGE_SIZE) : 0;
  const hrefFor = (p: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(values)) if (v) qs.set(k, v);
    if (p > 1) qs.set("page", String(p));
    const s = qs.toString();
    return s ? `/cases?${s}` : "/cases";
  };
  const brandName = values.brand ? brands?.find((b) => b.normalized === values.brand)?.name : undefined;
  const statusLabel = isCaseStatus(values.status) ? STATUS_INFO[values.status].label : "";
  const heading = brandName
    ? `${brandName}${statusLabel ? ` ${statusLabel.toLowerCase()}` : ""} class action lawsuits`
    : statusLabel
      ? `${statusLabel} lawsuits`
      : "All class action lawsuits";

  return (
    <div className="space-y-8">
      <Reveal className="space-y-4">
                <h1 className="text-4xl font-extrabold sm:text-5xl">
          {heading}
        </h1>
        <nav aria-label="Filter by status">
          <ul className="flex flex-wrap gap-2">
            {[{ key: "", label: "All" }, ...CASE_STATUSES.filter((s) => s !== "unknown").map((s) => ({ key: s, label: STATUS_INFO[s].label }))].map((s) => {
              const active = values.status === s.key;
              const qs = new URLSearchParams();
              if (values.q) qs.set("q", values.q);
              if (values.state) qs.set("state", values.state);
              if (values.brand) qs.set("brand", values.brand);
              if (values.proof) qs.set("proof", values.proof);
              if (s.key) qs.set("status", s.key);
              const href = qs.toString() ? `/cases?${qs}` : "/cases";
              return (
                <li key={s.key || "all"}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={`chip ${active ? "bg-sticker text-[#17175c]" : "hover:bg-surface-muted"}`}
                  >
                    {s.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </Reveal>
      <CaseFilters values={values} brands={brands} />
      {result === null ? (
        <div role="alert" className="rounded-lg bg-danger-bg px-4 py-3 text-sm text-danger-fg">
          We couldn&apos;t load lawsuits right now. Please try again shortly.
        </div>
      ) : result.cases.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="font-semibold">No lawsuits match these filters.</p>
          <p className="mt-1 text-sm text-muted">Try removing a filter or searching a broader term.</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted" aria-live="polite">
            {result.total.toLocaleString("en-US")} lawsuit{result.total === 1 ? "" : "s"}
            {pageCount > 1 && ` · page ${Math.min(page, pageCount)} of ${pageCount}`}
            {lookedUpLive && " · just fetched from federal court records"}
          </p>
          <CaseRows cases={result.cases} locked={tier === "anonymous"} />
        </>
      )}
      {result && result.cases.length === 0 && page > 1 && pageCount > 0 && (
        <p className="text-sm"><a className="link" href={hrefFor(1)}>Back to page 1</a></p>
      )}
      <Pagination page={page} pageCount={pageCount} hrefFor={hrefFor} />
      {tier === "anonymous" ? (
        <Paywall min="free" feature="See summaries and claim deadlines" next={hrefFor(page)} />
      ) : (
        <Paywall feature="See who qualifies and where to file" next={hrefFor(page)} />
      )}
    </div>
  );
}
