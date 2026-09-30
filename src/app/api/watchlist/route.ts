import { tierDeniedResponse } from "@/lib/auth/session";
import { z } from "zod";
import { addToWatchlist, getBrandByNormalized, normalizeBrandKey } from "@/lib/repo/brands";

export const runtime = "nodejs";

const Body = z.object({
  email: z.string().trim().max(254).pipe(z.email()),
  brand: z.string().trim().min(1).max(100), // normalized brand key, e.g. "coca-cola"
});

// POST /api/watchlist { email, brand } -> { ok: true } | 400 | 404 (unknown brand)
export async function POST(request: Request) {
  const denied = await tierDeniedResponse("pro");
  if (denied) return denied;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request.", issues: z.flattenError(parsed.error) },
      { status: 400 },
    );
  }
  const brand = await getBrandByNormalized(normalizeBrandKey(parsed.data.brand));
  if (!brand) return Response.json({ error: "Unknown brand." }, { status: 404 });

  try {
    await addToWatchlist(parsed.data.email, brand.id);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[watchlist] insert failed:", err instanceof Error ? err.message : err);
    return Response.json({ error: "Could not save. Please try again." }, { status: 500 });
  }
}
