import type { ComplaintAnalysisRecord } from "@/lib/types";
import { formatDate } from "@/components/format";

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n < 100 ? 2 : 0 });

function payoutRange(low: number | null, high: number | null): string | null {
  if (low != null && high != null) return low === high ? usd(low) : `${usd(low)} – ${usd(high)}`;
  if (high != null) return `Up to ${usd(high)}`;
  if (low != null) return `${usd(low)}+`;
  return null;
}

/** AI reading of the complaint PDF: what it alleges, who is in the class, estimated payout. */
export function ComplaintAnalysis({ record }: { record: ComplaintAnalysisRecord | null }) {
  const a = record?.status === "parsed" ? record.analysis : null;
  if (!a) return null;
  const cls = a.class_definition;
  const payout = a.estimated_payout;
  const range = payoutRange(payout.low_usd, payout.high_usd);

  return (
    <section aria-labelledby="complaint-analysis-heading" className="card space-y-6 p-6 sm:p-8">
      <div>
        <h2 id="complaint-analysis-heading" className="text-2xl font-bold">What the complaint says</h2>
        <p className="mt-3 whitespace-pre-line leading-relaxed">{a.summary}</p>
      </div>

      {(a.allegations.overview || a.allegations.defendant_conduct.length > 0) && (
        <div>
          <h3 className="text-lg font-bold">Allegations</h3>
          {a.allegations.overview && <p className="mt-2 leading-relaxed">{a.allegations.overview}</p>}
          {a.allegations.defendant_conduct.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 leading-relaxed">
              {a.allegations.defendant_conduct.map((x) => <li key={x}>{x}</li>)}
            </ul>
          )}
          {a.allegations.products_or_services.length > 0 && (
            <p className="mt-2 text-sm text-muted">Products and services: {a.allegations.products_or_services.join(", ")}</p>
          )}
        </div>
      )}

      {(cls.plain_language || cls.eligibility_criteria.length > 0) && (
        <div>
          <h3 className="text-lg font-bold">Who is in the class</h3>
          {cls.plain_language && <p className="mt-2 leading-relaxed">{cls.plain_language}</p>}
          {cls.eligibility_criteria.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 leading-relaxed">
              {cls.eligibility_criteria.map((x) => <li key={x}>{x}</li>)}
            </ul>
          )}
          {(cls.class_period || cls.geography) && (
            <p className="mt-2 text-sm text-muted">
              {[cls.class_period && `Period: ${cls.class_period}`, cls.geography && `Where: ${cls.geography}`]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
          {cls.subclasses.length > 0 && (
            <p className="mt-1 text-sm text-muted">Subclasses: {cls.subclasses.map((s) => s.name).join(", ")}</p>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-border bg-surface/70 p-4">
        <h3 className="text-lg font-bold">Estimated payout per person</h3>
        <p className="mt-1 text-2xl font-extrabold">{range ?? "Not enough information to estimate"}</p>
        <p className="mt-2 text-sm leading-relaxed">{payout.basis}</p>
        <p className="mt-2 text-xs text-muted">{payout.disclaimer}</p>
      </div>

      <p className="text-xs text-muted">
        AI-generated from the complaint{record?.truncated ? " (long filing; key sections read)" : ""}
        {record?.parsedAt ? ` on ${formatDate(record.parsedAt)}` : ""}. May contain errors; read the complaint below.
      </p>
    </section>
  );
}
