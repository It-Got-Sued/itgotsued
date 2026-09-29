import type { Metadata } from "next";
import { searchCases } from "@/lib/repo/cases";
import { listBrands } from "@/lib/repo/brands";
import { CaseList } from "@/components/CaseCard";
import { CaseFilters, type FilterValues } from "@/components/CaseFilters";
import { Pagination } from "@/components/Pagination";
import { isCaseStatus, STATUS_INFO } from "@/components/status";
import { Reveal } from "@/components/motion";
import { CASE_STATUSES } from "@/lib/types";
import Link from "next/link";

export const metadata: Metadata = {
  title: "All class action lawsuits",
  description: "Search and filter every U.S. class action lawsuit by status, state, and brand.",
};

const PAGE_SIZE = 20;

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

export default async function CasesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const values: FilterValues = {
    q: one(sp.q).slice(0, 200),
    status: isCaseStatus(one(sp.status)) ? one(sp.status) : "",
    state: /^[A-Za-z]{2}$/.test(one(sp.state)) ? one(sp.state).toUpperCase() : "",
    brand: one(sp.brand).toLowerCase().slice(0, 100),
  };
  const page = Math.max(1, Number.parseInt(one(sp.page), 10) || 1);

  const result = (() => {
    try {
      return searchCases({
        q: values.q || undefined,
        status: isCaseStatus(values.status) ? values.status : undefined,
        state: values.state || undefined,
        brand: values.brand || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
    } catch {
      return null;
    }
  })();
  const brands = (() => {
    try {
      return listBrands().map((b) => ({ normalized: b.normalized, name: b.name }));
    } catch {
      return null;
    }
  })();

  const pageCount = result ? Math.ceil(result.total / PAGE_SIZE) : 0;
  const hrefFor = (p: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(values)) if (v) qs.set(k, v);
    if (p > 1) qs.set("page", String(p));
    const s = qs.toString();
    return s ? `/cases?${s}` : "/cases";
  };
  const heading = isCaseStatus(values.status) ? `${STATUS_INFO[values.status].label} lawsuits` : "All class action lawsuits";

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
          </p>
          <CaseList cases={result.cases} headingLevel={2} />
        </>
      )}
      {result && result.cases.length === 0 && page > 1 && pageCount > 0 && (
        <p className="text-sm"><a className="link" href={hrefFor(1)}>Back to page 1</a></p>
      )}
      <Pagination page={page} pageCount={pageCount} hrefFor={hrefFor} />
    </div>
  );
}
