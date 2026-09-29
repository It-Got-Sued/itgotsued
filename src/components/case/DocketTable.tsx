import type { DocketEntry } from "@/lib/types";
import { formatDate, safeUrl } from "../format";

export function DocketTable({ entries }: { entries: DocketEntry[] }) {
  return (
    <section aria-labelledby="docket-heading" className="card space-y-4 p-6 sm:p-8">
      <h2 id="docket-heading" className="text-2xl font-bold">Docket entries</h2>
      {entries.length === 0 ? (
        <p className="text-sm text-muted">No docket entries recorded yet.</p>
      ) : (
        <div className="relative overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <caption className="sr-only">Court filings in this case, oldest first</caption>
            <thead className="bg-surface-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">#</th>
                <th scope="col" className="px-3 py-2 font-semibold">Date</th>
                <th scope="col" className="px-3 py-2 font-semibold">Description</th>
                <th scope="col" className="px-3 py-2 font-semibold"><span className="sr-only">Document</span></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => {
                const doc = safeUrl(e.documentUrl);
                return (
                  <tr key={`${e.entryNumber ?? "x"}-${i}`} className="border-t border-border align-top transition-colors hover:bg-primary/5">
                    <td className="px-3 py-2 tabular-nums">{e.entryNumber ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2">{formatDate(e.dateFiled) ?? "—"}</td>
                    <td className="px-3 py-2">{e.description}</td>
                    <td className="px-3 py-2">
                      {doc && (
                        <a href={doc} target="_blank" rel="noopener noreferrer" className="link whitespace-nowrap">
                          View<span className="sr-only"> document for entry {e.entryNumber ?? i + 1}</span>
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
