import { z } from "zod";
import { getTier } from "@/lib/auth/session";
import { shieldSummary } from "@/lib/paywall";
import { searchCases } from "@/lib/repo/cases";
import { CASE_STATUSES, type CaseSearchParams, type CaseSearchResult } from "@/lib/types";

export const runtime = "nodejs";

// Empty query-string values ("?status=") are treated as absent.
const blank = (v: unknown) => (v === "" || v === null ? undefined : v);

const Query = z.object({
  q: z.preprocess(blank, z.string().trim().max(200).optional()),
  status: z.preprocess(blank, z.enum(CASE_STATUSES as [string, ...string[]]).optional()),
  brand: z.preprocess(
    blank,
    z.string().trim().toLowerCase().max(100).regex(/^[a-z0-9-]+$/, "Use a normalized brand key").optional(),
  ),
  state: z.preprocess(
    blank,
    z.string().trim().regex(/^[A-Za-z]{2}$/, "Use a two-letter state code").toUpperCase().optional(),
  ),
  page: z.preprocess(blank, z.coerce.number().int().min(1).max(10_000).optional()),
  pageSize: z.preprocess(blank, z.coerce.number().int().min(1).max(100).optional()),
});

// GET /api/cases?q=&status=&brand=&state=&page=&pageSize= -> CaseSearchResult
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const parsed = Query.safeParse({
    q: sp.get("q"),
    status: sp.get("status"),
    brand: sp.get("brand"),
    state: sp.get("state"),
    page: sp.get("page"),
    pageSize: sp.get("pageSize"),
  });
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid query parameters.", issues: z.flattenError(parsed.error) },
      { status: 400 },
    );
  }
  try {
    const result: CaseSearchResult = await searchCases(parsed.data as CaseSearchParams);
    const tier = await getTier();
    result.cases = result.cases.map((c) => shieldSummary(c, tier));
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[cases] search failed:", err instanceof Error ? err.message : err);
    return Response.json({ error: "Search failed. Please try again." }, { status: 500 });
  }
}
