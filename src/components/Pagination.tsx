import Link from "next/link";

export function Pagination({
  page,
  pageCount,
  hrefFor,
}: {
  page: number;
  pageCount: number;
  hrefFor: (page: number) => string;
}) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-2">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className="btn-secondary" rel="prev">
          ← Previous
        </Link>
      ) : (
        <span />
      )}
      <span className="chip text-muted" aria-current="page">
        Page {page} of {pageCount}
      </span>
      {page < pageCount ? (
        <Link href={hrefFor(page + 1)} className="btn-secondary" rel="next">
          Next →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
