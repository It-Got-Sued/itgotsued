export function Alert({
  tone = "danger",
  children,
}: {
  tone?: "danger" | "info" | "warn" | "success";
  children: React.ReactNode;
}) {
  const cls = {
    danger: "bg-danger-bg text-danger-fg",
    info: "bg-info-bg text-info-fg",
    warn: "bg-warn-bg text-warn-fg",
    success: "bg-success-bg text-success-fg",
  }[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`rounded-lg px-4 py-3 text-sm ${cls}`}>
      {children}
    </div>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-muted">
      <span
        aria-hidden
        className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
      />
      {label}
    </span>
  );
}
