export function ExternalLinkNotice({ children }: { children?: React.ReactNode }) {
  return (
    <p className="text-xs text-muted">
      {children ??
        "You are leaving ClassActionForMe for an official third-party site. We never ask for payment to file a claim."}
    </p>
  );
}
