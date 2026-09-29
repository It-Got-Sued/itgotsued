import Link from "next/link";
import type { CaseSummary } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";
import { SampleBadge } from "./SampleBadge";
import { daysUntil, formatDate } from "./format";
import { IconArrowRight, IconClock } from "./icons";

/** Dense list view of cases: one row per lawsuit, whole row clickable. */
export function CaseRows({ cases, headingLevel = 2 }: { cases: CaseSummary[]; headingLevel?: 2 | 3 }) {
  const H = `h${headingLevel}` as "h2" | "h3";
  return (
    <div className="card overflow-hidden p-0">
      {/* Column headings (wide screens only) */}
      <div
        aria-hidden
        className="hidden grid-cols-[9.5rem_minmax(0,1fr)_9rem_9rem_1.5rem] gap-4 border-b-2 border-border bg-surface-muted px-5 py-2.5 text-xs font-bold uppercase tracking-wide text-muted md:grid"
      >
        <span>Status</span>
        <span>Case</span>
        <span>Filed</span>
        <span>Claim deadline</span>
        <span />
      </div>
      <ol className="divide-y-2 divide-border">
        {cases.map((c) => {
          const days = c.status === "claims_open" ? daysUntil(c.claimDeadline) : null;
          const urgent = days !== null && days >= 0 && days <= 14;
          return (
            <li
              key={c.id}
              className="group relative grid gap-x-4 gap-y-1.5 px-5 py-4 transition-colors hover:bg-surface-muted md:grid-cols-[9.5rem_minmax(0,1fr)_9rem_9rem_1.5rem] md:items-center"
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusBadge status={c.status} />
                {c.isSample && <SampleBadge />}
              </div>

              <div className="min-w-0">
                <H className="font-sans! text-base font-bold! leading-snug tracking-normal">
                  {/* Stretched link: the whole row is clickable. */}
                  <Link
                    href={`/cases/${encodeURIComponent(c.id)}`}
                    className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none group-hover:underline"
                  >
                    {c.caseName}
                  </Link>
                </H>
                <p className="mt-0.5 truncate text-sm text-muted">
                  {c.court}
                  {c.docketNumber && <> · {c.docketNumber}</>}
                  {c.brands.length > 0 && (
                    <>
                      {" · "}
                      <span className="sr-only">Brands: </span>
                      <span className="font-semibold text-foreground">{c.brands.slice(0, 4).join(", ")}</span>
                    </>
                  )}
                </p>
                {c.summary && <p className="mt-1 line-clamp-1 text-sm">{c.summary}</p>}
              </div>

              <p className="text-sm text-muted md:text-foreground">
                <span className="md:hidden">Filed </span>
                {formatDate(c.dateFiled) ?? "—"}
              </p>

              <p className="text-sm">
                {c.claimDeadline && c.status === "claims_open" ? (
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      urgent ? "bg-danger-bg text-danger-fg" : "bg-success-bg text-success-fg"
                    }`}
                  >
                    <IconClock size={12} />
                    {formatDate(c.claimDeadline)}
                    {days !== null && days >= 0 && ` · ${days === 0 ? "today" : `${days}d`}`}
                  </span>
                ) : (
                  <span className="hidden text-muted md:inline">—</span>
                )}
              </p>

              <span aria-hidden className="hidden text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-primary md:block">
                <IconArrowRight size={16} />
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
