import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import "./globals.css";

// Fonts are self-hosted from src/app/fonts (SIL Open Font License) so builds never
// depend on fetching from Google Fonts.
const display = localFont({
  variable: "--font-display",
  src: "./fonts/DelaGothicOne-Regular.woff2",
  weight: "400",
  display: "swap",
});

const body = localFont({
  variable: "--font-body",
  src: "./fonts/Figtree-Variable.woff2",
  weight: "300 900",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://itgotsued.com"),
  title: {
    default: "It Got Sued: find lawsuits over the stuff you own",
    template: "%s | It Got Sued",
  },
  description:
    "Every U.S. class action lawsuit in one index. Describe what you own, snap a photo, or scan your bank transactions to see which of your things got sued and where to file a claim.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0c38" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} h-full antialiased`}
    >
      <body className="relative flex min-h-full flex-col overflow-x-hidden">
        <StampInkFilter />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:border-2 focus:border-border focus:bg-sticker focus:text-[#17175c] focus:px-3 focus:py-2"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}

/** Roughens the edges of `.stamp` elements so they read as rubber-stamped ink. */
function StampInkFilter() {
  return (
    <svg aria-hidden width="0" height="0" className="absolute">
      <filter id="stamp-ink">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.2" />
      </filter>
    </svg>
  );
}
