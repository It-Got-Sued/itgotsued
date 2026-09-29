import Link from "next/link";
import type { BrandMatch, CaseSummary } from "@/lib/types";
import { CaseCard } from "./CaseCard";

export function sortClaimsOpenFirst(cases: CaseSummary[]): CaseSummary[] {
  return [...cases].sort(
    (a, b) => Number(b.status === "claims_open") - Number(a.status === "claims_open"),
  );
}

/** One matched brand and its lawsuits. `actions` renders extra controls (client). */
export function BrandMatchSection({
  match,
  actions,
}: {
  match: BrandMatch;
  actions?: React.ReactNode;
}) {
  const cases = sortClaimsOpenFirst(match.cases);
  const open = cases.filter((c) => c.status === "claims_open").length;
  const seenAs = [...new Set(match.detections.map((d) => d.brand))].filter(
    (b) => b.toLowerCase() !== match.brand.name.toLowerCase(),
  );
  return (
    <section aria-labelledby={`m-${match.brand.id}`} className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 id={`m-${match.brand.id}`} className="text-lg font-semibold">
            {match.brand.name}
            <span className="ml-2 text-sm font-normal text-muted">
              {cases.length} lawsuit{cases.length === 1 ? "" : "s"}
              {open > 0 && ` · ${open} with claims open`}
            </span>
          </h3>
          {(seenAs.length > 0 || match.brand.parentCompany) && (
            <p className="text-sm text-muted">
              {seenAs.length > 0 && <>Matched from &ldquo;{seenAs.join("”, “")}&rdquo;. </>}
              {match.brand.parentCompany && <>Owned by {match.brand.parentCompany}.</>}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          <Link href={`/cases?brand=${encodeURIComponent(match.brand.normalized)}`} className="link text-sm">
            All {match.brand.name} cases
          </Link>
        </div>
      </div>
      {cases.length === 0 ? (
        <p className="text-sm text-muted">No lawsuits found for this brand yet.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {cases.map((c) => (
            <li key={c.id}>
              <CaseCard c={c} headingLevel={4} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
