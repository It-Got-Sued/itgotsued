import type { Metadata } from "next";

export const SITE_URL = "https://itgotsued.com";
export const SITE_NAME = "It Got Sued";

// Served by src/app/opengraph-image.tsx. Listed explicitly because a page that sets its
// own `openGraph` replaces the root one, file-based image included.
const SOCIAL_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: "It Got Sued: find class action lawsuits over the stuff you own",
};

/** Truncates to `max` chars on a word boundary, for meta descriptions (~155-160 chars). */
export function clip(text: string, max = 158): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:—-]+$/, "")}…`;
}

/**
 * Per-page metadata with a self-referencing canonical and matching Open Graph / Twitter
 * tags. Canonicals are set per page, never in the root layout, because a layout
 * canonical is inherited by every child page that forgets to set its own.
 */
export function pageMetadata(opts: {
  title: string;
  description: string;
  path: string;
  type?: "website" | "article";
  noindex?: boolean;
  absoluteTitle?: boolean;
}): Metadata {
  const description = clip(opts.description);
  // Social cards show the page title without the "| It Got Sued" template suffix.
  return {
    title: opts.absoluteTitle ? { absolute: opts.title } : opts.title,
    description,
    alternates: { canonical: opts.path },
    openGraph: {
      title: opts.title,
      description,
      url: opts.path,
      siteName: SITE_NAME,
      type: opts.type ?? "website",
      locale: "en_US",
      images: [SOCIAL_IMAGE],
    },
    twitter: { card: "summary_large_image", title: opts.title, description, images: [SOCIAL_IMAGE.url] },
    robots: opts.noindex ? { index: false, follow: true } : undefined,
  };
}

/** Serializes JSON-LD for a <script> tag, escaping "<" so data cannot close the tag. */
export function jsonLd(data: unknown): { __html: string } {
  return { __html: JSON.stringify(data).replace(/</g, "\\u003c") };
}
