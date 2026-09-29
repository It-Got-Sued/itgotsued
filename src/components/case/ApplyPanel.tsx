import type { CaseDetail } from "@/lib/types";
import { daysUntil, formatDate, safeUrl } from "../format";
import { ExternalLinkNotice } from "../ExternalLinkNotice";
import { AddToCalendar } from "./AddToCalendar";

/** Settlement facts, the Apply button (claims_open + claimUrl only), and calendar export. */
export function ApplyPanel({ c }: { c: CaseDetail }) {
  const claimUrl = safeUrl(c.claimUrl);
  const canApply = c.status === "claims_open" && !!claimUrl;
  const days = daysUntil(c.claimDeadline);
  const hasFacts = c.settlementAmount || c.claimDeadline;
  if (!hasFacts && !canApply) return null;

  return (
    <section
      aria-labelledby="settlement-heading"
      className={`relative space-y-4 overflow-hidden rounded-2xl p-6 ${
        canApply
          ? "border-2 border-border bg-success-bg shadow-hard"
          : "card"
      }`}
    >
      <h2 id="settlement-heading" className="relative text-xl font-bold">
        {canApply ? "Claims are open" : "Settlement"}
      </h2>
      <dl className="relative grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-1">
        {c.settlementAmount && (
          <div>
            <dt className="text-muted">Settlement amount</dt>
            <dd className="font-display text-2xl font-bold">{c.settlementAmount}</dd>
          </div>
        )}
        {c.claimDeadline && (
          <div>
            <dt className="text-muted">Claim deadline</dt>
            <dd className="font-semibold">
              {formatDate(c.claimDeadline)}
              {days !== null && days >= 0 && ` (${days === 0 ? "today" : `${days} days left`})`}
              {days !== null && days < 0 && " (passed)"}
            </dd>
          </div>
        )}
      </dl>
      {canApply && (
        <div className="space-y-2">
          <a
            href={claimUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn w-full border-[#17175c] bg-mint px-6 text-base text-[#062b1a] shadow-soft hover:brightness-105"
          >
            Apply on the official settlement site
            <span aria-hidden>↗</span>
            <span className="sr-only">(opens in a new tab)</span>
          </a>
          <ExternalLinkNotice>
            This opens the official settlement administrator&apos;s website in a new tab. We don&apos;t file
            claims for you and never charge for claims. Filing a claim is free.
          </ExternalLinkNotice>
        </div>
      )}
      {canApply && c.isSample && (
        <p className="text-sm font-medium text-warn-fg">
          Sample case: this link is a placeholder for demonstration, not a real claim form.
        </p>
      )}
      {c.claimDeadline && days !== null && days >= 0 && (
        <AddToCalendar caseId={c.id} caseName={c.caseName} deadline={c.claimDeadline} claimUrl={canApply ? claimUrl : null} />
      )}
    </section>
  );
}
