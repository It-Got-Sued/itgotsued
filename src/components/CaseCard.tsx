import Link from "next/link";
import type { CaseSummary } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";
import { SampleBadge } from "./SampleBadge";
import { daysUntil, formatDate } from "./format";
import { STATUS_INFO, TONE_ACCENT } from "./status";
import { IconArrowRight, IconClock } from "./icons";
import { StaggerItem, StaggerList } from "./motion";

// Rotating chip colors so brand tags feel lively but stay readable.
const CHIP_TONES = [
  "bg-violet-500/12 text-violet-700 dark:text-violet-300",
  "bg-pink-500/12 text-pink-700 dark:text-pink-300",
  "bg-orange-500/12 text-orange-700 dark:text-orange-300",
  "bg-cyan-500/12 text-cyan-700 dark:text-cyan-300",
  "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
];

export function BrandTag({ name, index = 0 }: { name: string; index?: number }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${CHIP_TONES[index % CHIP_TONES.length]}`}
    >
      {name}
    </span>
  );
}

export function CaseCard({ c, headingLevel = 3 }: { c: CaseSummary; headingLevel?: 2 | 3 | 4 }) {
  const H = `h${headingLevel}` as "h2" | "h3" | "h4";
  const tone = (STATUS_INFO[c.status] ?? STATUS_INFO.unknown).tone;
  const days = c.status === "claims_open" ? daysUntil(c.claimDeadline) : null;
  const urgent = days !== null && days >= 0 && days <= 14;

  return (
    <article className="card gradient-ring group relative flex h-full flex-col overflow-hidden p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-lift">
      <div
        aria-hidden
        className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${TONE_ACCENT[tone]}`}
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <StatusBadge status={c.status} />
        {c.isSample && <SampleBadge />}
      </div>
      <H className="text-[1.05rem] font-semibold leading-snug">
        {/* Stretched link: the whole card is clickable. */}
        <Link
          href={`/cases/${encodeURIComponent(c.id)}`}
          className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
        >
          {c.caseName}
        </Link>
      </H>
      <p className="mt-1 text-sm text-muted">
        {c.court}
        {c.dateFiled && <> · Filed {formatDate(c.dateFiled)}</>}
      </p>
      {c.summary && <p className="mt-3 line-clamp-3 text-sm leading-relaxed">{c.summary}</p>}
      {c.brands.length > 0 && (
        <p className="mt-3 flex flex-wrap gap-1.5">
          <span className="sr-only">Brands: </span>
          {c.brands.slice(0, 6).map((b, i) => (
            <BrandTag key={b} name={b} index={i} />
          ))}
        </p>
      )}
      <div className="mt-auto flex items-center justify-between gap-2 pt-4">
        {c.claimDeadline && c.status === "claims_open" ? (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
              urgent ? "bg-danger-bg text-danger-fg" : "bg-success-bg text-success-fg"
            }`}
          >
            <IconClock size={14} />
            {formatDate(c.claimDeadline)}
            {days !== null && days >= 0 && ` · ${days === 0 ? "today" : `${days} days left`}`}
          </span>
        ) : (
          <span />
        )}
        <span
          aria-hidden
          className="grid h-8 w-8 place-items-center rounded-full bg-surface-muted text-primary transition-all duration-300 group-hover:translate-x-0.5 group-hover:bg-brand-gradient group-hover:text-white"
        >
          <IconArrowRight size={16} />
        </span>
      </div>
    </article>
  );
}

export function CaseList({ cases, headingLevel }: { cases: CaseSummary[]; headingLevel?: 2 | 3 | 4 }) {
  return (
    <StaggerList className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cases.map((c) => (
        <StaggerItem key={c.id}>
          <CaseCard c={c} headingLevel={headingLevel} />
        </StaggerItem>
      ))}
    </StaggerList>
  );
}
