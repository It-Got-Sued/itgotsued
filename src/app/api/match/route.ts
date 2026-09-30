import { getTier, tierDeniedResponse } from "@/lib/auth/session";
import { shieldSummary } from "@/lib/paywall";
import { z } from "zod";
import { badRequest, errorResponse } from "@/lib/brands/http";
import { matchDetections, MAX_DETECTIONS } from "@/lib/brands/match";
import type { MatchRequest } from "@/lib/types";

export const runtime = "nodejs";

const Detection = z.object({
  brand: z.string().trim().min(1).max(200),
  product: z.string().max(300).optional(),
  category: z.string().max(100).optional(),
  confidence: z.number().min(0).max(1),
  source: z.enum(["photo", "text", "bank", "receipt", "manual"]),
});

const Body = z.object({
  detections: z.array(Detection).max(MAX_DETECTIONS, `At most ${MAX_DETECTIONS} items per request.`),
  activeOnly: z.boolean().optional(),
}) satisfies z.ZodType<MatchRequest>;

// POST MatchRequest { detections, activeOnly? } -> { matches: RankedBrandMatch[] }
// (BrandMatch plus relation/via/method/confidence).
export async function POST(request: Request) {
  const denied = await tierDeniedResponse("free");
  if (denied) return denied;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return badRequest("Expected a JSON body.");
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return badRequest("Invalid request.", z.flattenError(parsed.error));

  try {
    const tier = await getTier();
    const matches = (await matchDetections(parsed.data.detections, { activeOnly: parsed.data.activeOnly })).map((m) => ({
      ...m,
      cases: m.cases.map((c) => shieldSummary(c, tier)),
    }));
    return Response.json({ matches }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
