import type { MetadataRoute } from "next";
import { query } from "@/lib/db";
import { SITE_URL } from "@/lib/seo";

// Regenerate hourly so new lawsuits from ingest reach crawlers without a redeploy.
export const revalidate = 3600;

// One file holds up to 50,000 URLs; the index is far below that today. Switch to
// generateSitemaps() if cases + brands ever approach the limit.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages: MetadataRoute.Sitemap = ["/", "/cases", "/scan", "/about", "/privacy"].map((path) => ({
    url: `${SITE_URL}${path === "/" ? "/" : path}`,
  }));

  try {
    const [cases, brands] = await Promise.all([
      query<{ id: string; updated_at: Date }>(
        "SELECT id, updated_at FROM cases WHERE NOT is_sample ORDER BY date_filed DESC NULLS LAST, id",
      ),
      // Brand landing pages (/cases?brand=…) only when the brand has a real lawsuit.
      query<{ normalized: string; updated_at: Date }>(
        `SELECT b.normalized, max(c.updated_at) AS updated_at
         FROM brands b
         JOIN case_brands cb ON cb.brand_id = b.id
         JOIN cases c ON c.id = cb.case_id AND NOT c.is_sample
         WHERE NOT b.is_sample
         GROUP BY b.normalized ORDER BY b.normalized`,
      ),
    ]);
    return [
      ...pages,
      ...brands.map((b) => ({
        url: `${SITE_URL}/cases?brand=${encodeURIComponent(b.normalized)}`,
        lastModified: b.updated_at,
      })),
      ...cases.map((c) => ({
        url: `${SITE_URL}/cases/${encodeURIComponent(c.id)}`,
        lastModified: c.updated_at,
      })),
    ];
  } catch {
    // Database unreachable: still serve the static pages rather than an error.
    return pages;
  }
}
