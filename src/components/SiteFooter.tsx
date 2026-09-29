import Link from "next/link";
import { Logo } from "./SiteHeader";

export function SiteFooter() {
  return (
    <footer className="relative mt-20 border-t-2 border-border">
      <div className="bg-surface-muted">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-[1.5fr_1fr] sm:px-6">
          <div className="space-y-3">
            <Logo />
            <p className="max-w-md text-sm text-muted">
              Information only, not legal advice. We never file claims for you. &ldquo;Apply&rdquo;
              always links to the official settlement administrator.
            </p>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap content-start gap-x-6 gap-y-3 text-sm sm:justify-end">
            <Link href="/cases" className="font-semibold text-muted transition-colors hover:text-foreground">All lawsuits</Link>
            <Link href="/scan" className="font-semibold text-muted transition-colors hover:text-foreground">Scan</Link>
            <Link href="/my-items" className="font-semibold text-muted transition-colors hover:text-foreground">My Items</Link>
            <Link href="/privacy" className="font-semibold text-muted transition-colors hover:text-foreground">Privacy</Link>
            <Link href="/about" className="font-semibold text-muted transition-colors hover:text-foreground">About</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
