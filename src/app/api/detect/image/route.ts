import { hasAnthropicKey } from "@/lib/brands/claude";
import { detectBrandsInImage, MAX_IMAGE_BYTES } from "@/lib/brands/detect-image";
import { badRequest, errorResponse } from "@/lib/brands/http";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/brands/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 120;

// POST multipart/form-data with field "image" -> { detections: BrandDetection[] }.
// The photo is held in memory for this request only: never written to disk or logged.
export async function POST(request: Request) {
  const limit = rateLimit("detect-image", clientIp(request), 10, 60_000);
  if (!limit.ok) return tooManyRequests(limit);

  if (!hasAnthropicKey()) {
    return Response.json(
      { error: "Photo scanning is unavailable: the server has no ANTHROPIC_API_KEY configured." },
      { status: 503 },
    );
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_IMAGE_BYTES + 64 * 1024) {
    return Response.json({ error: "Image is too large. The limit is 5 MB." }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return badRequest('Expected multipart/form-data with an "image" file field.');
  }
  const file = form.get("image");
  if (!(file instanceof File)) return badRequest('Missing "image" file field.');
  if (file.size > MAX_IMAGE_BYTES) {
    return Response.json({ error: "Image is too large. The limit is 5 MB." }, { status: 413 });
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const detections = await detectBrandsInImage(bytes, file.type || undefined);
    return Response.json({ detections }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
