import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card space-y-3 p-6">
      <h1 className="text-xl font-bold">We couldn&apos;t find that lawsuit.</h1>
      <p className="text-muted">It may have been merged with another case or the link may be wrong.</p>
      <Link href="/cases" className="btn-primary">Browse all lawsuits</Link>
    </div>
  );
}
