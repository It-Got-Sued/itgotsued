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
  const isParent = match.relation === "parent";
  const owned = match.via?.join(", ");
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
          {isParent ? (
            <p className="text-sm text-muted">
              Parent company of {owned}. Only lawsuits whose court filings name {owned} are shown.
              {match.unverifiedCount ? ` ${match.unverifiedCount} other ${match.brand.name} lawsuit${match.unverifiedCount === 1 ? "" : "s"} don't mention it.` : ""}
            </p>
          ) : (seenAs.length > 0 || match.brand.parentCompany) && (
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
            <li key={c.id} className="space-y-1.5">
              <CaseCard c={c} headingLevel={4} />
              {isParent && match.mentions?.[c.id] && (
                <p className="px-1 text-xs font-semibold text-muted">
                  Filings name {match.mentions[c.id]}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Parent companies we checked but left out: they have lawsuits, none of which name the
 * brand the user owns. Shown so "no results" doesn't look like we missed them.
 */
export function ParentNotes({ matches }: { matches: BrandMatch[] }) {
  const notes = matches.filter((m) => m.relation === "parent" && !m.cases.length && m.unverifiedCount);
  if (!notes.length) return null;
  return (
    <ul className="space-y-1 text-sm text-muted">
      {notes.map((m) => (
        <li key={m.brand.id}>
          {m.via?.join(", ")} is owned by {m.brand.name}, which has {m.unverifiedCount} lawsuit
          {m.unverifiedCount === 1 ? "" : "s"}, but the court filings we have don&apos;t mention{" "}
          {m.via?.join(", ")}.{" "}
          <Link href={`/cases?brand=${encodeURIComponent(m.brand.normalized)}`} className="link">
            See {m.brand.name} lawsuits
          </Link>
        </li>
      ))}
    </ul>
  );
}
