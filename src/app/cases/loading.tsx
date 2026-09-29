export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <p role="status" className="sr-only">Loading lawsuits…</p>
      <div className="skeleton h-12 w-2/3 max-w-md" />
      <div className="skeleton h-40" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="skeleton h-52" />
        ))}
      </div>
    </div>
  );
}
