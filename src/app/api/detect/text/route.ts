import { subscriberOnlyResponse } from "@/lib/auth/session";
import { z } from "zod";
import { detectBrandsInText, MAX_DESCRIPTION_CHARS } from "@/lib/brands/detect-text";
import { badRequest, errorResponse } from "@/lib/brands/http";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/brands/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  description: z.string().trim().min(1, "Describe at least one product.").max(MAX_DESCRIPTION_CHARS),
});

// POST { description } -> { detections: BrandDetection[] }. Falls back to a dictionary
// lookup when ANTHROPIC_API_KEY is not configured.
export async function POST(request: Request) {
  const denied = await subscriberOnlyResponse();
  if (denied) return denied;
  const limit = rateLimit("detect-text", clientIp(request), 30, 60_000);
  if (!limit.ok) return tooManyRequests(limit);

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return badRequest("Expected a JSON body.");
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return badRequest("Invalid request.", z.flattenError(parsed.error).fieldErrors);

  try {
    const detections = await detectBrandsInText(parsed.data.description);
    return Response.json({ detections }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
