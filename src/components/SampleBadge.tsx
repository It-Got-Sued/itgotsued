export function SampleBadge() {
  return (
    <span className="inline-flex items-center rounded-full border border-warn-fg/40 bg-warn-bg px-2.5 py-0.5 text-xs font-semibold text-warn-fg">
      Sample data — fictional case
    </span>
  );
}

export function SampleBanner() {
  return (
    <div role="note" className="rounded-lg border border-warn-fg/40 bg-warn-bg px-4 py-3 text-sm text-warn-fg">
      <strong>Sample data — fictional case.</strong> This lawsuit and the company in it are made
      up for demonstration. It is not a real court case and there is nothing to claim.
    </div>
  );
}
