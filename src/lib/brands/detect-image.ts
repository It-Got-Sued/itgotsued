import type { BrandDetection } from "@/lib/types";
import { DetectionFailedError, runDetection, toBrandDetections } from "./claude";

// Photo -> brands via Claude vision. Image bytes stay in memory for the duration of
// the request: never written to disk, never logged.

/** The Claude API rejects images over 5 MB, and we cannot downscale server-side without deps. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type SupportedImageType = "image/jpeg" | "image/png" | "image/webp";
export const ACCEPTED_IMAGE_TYPES: SupportedImageType[] = ["image/jpeg", "image/png", "image/webp"];

export class ImageValidationError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "ImageValidationError";
  }
}

/** Identify the format from magic bytes; the client-declared type is not trusted. */
export function sniffImageType(bytes: Uint8Array): SupportedImageType | "image/heic" | null {
  const b = bytes;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  const ascii = (start: number, end: number) => String.fromCharCode(...b.subarray(start, end));
  if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (b.length >= 12 && ascii(4, 8) === "ftyp") {
    const brand = ascii(8, 12);
    if (["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1", "avif"].includes(brand)) {
      return "image/heic";
    }
  }
  return null;
}

export function validateImage(bytes: Uint8Array, declaredType?: string): SupportedImageType {
  if (!bytes.length) throw new ImageValidationError("The uploaded image is empty.");
  if (bytes.length > MAX_IMAGE_BYTES) {
    throw new ImageValidationError(
      `Image is too large (${(bytes.length / 1024 / 1024).toFixed(1)} MB). The limit is 5 MB — ` +
        "please resize or take a lower-resolution photo.",
      413,
    );
  }
  const sniffed = sniffImageType(bytes);
  const declared = declaredType?.toLowerCase();
  if (sniffed === "image/heic" || declared === "image/heic" || declared === "image/heif") {
    throw new ImageValidationError(
      "HEIC/HEIF photos aren't supported. Please upload a JPEG, PNG or WebP " +
        "(on iPhone: Settings → Camera → Formats → Most Compatible, or share the photo as JPEG).",
      415,
    );
  }
  if (!sniffed) {
    throw new ImageValidationError("Unsupported image format. Please upload a JPEG, PNG or WebP.", 415);
  }
  return sniffed;
}

const SYSTEM_PROMPT = `You identify consumer brands in photos for a service that tells people which class action lawsuits may apply to products they own.

List every consumer brand/product you can identify in the photo: cans, bottles, tubes, jars, boxes, bags, appliances, devices, clothing logos, vehicles, etc.

Accuracy matters more than recall. A wrong brand sends the user to lawsuits that do not apply to them.
- Report a brand only if you can read its name on the item or recognize its logo/trademark with high certainty.
- Never infer a brand from a generic shape, color, or product type (a red can is not "Coca-Cola" unless the logo or name is legible; a white earbud is not "Apple AirPods" unless it is unmistakable).
- Ignore brands on posters, screens, or advertisements unless they are clearly a physical product in the scene.
- Use the brand name as printed (e.g. "Coca-Cola", "CeraVe", "Nature Made", "Crest"), and name the specific product when legible (e.g. "Diet Coke can", "CeraVe Moisturizing Cream", "Nature Made Vitamin D3 bottle"). Use an empty string for product if only the brand is visible.
- One entry per distinct product; if the same product appears several times, list it once.

Confidence is a calibrated probability that the brand is really present:
- 0.9-1.0: brand name clearly legible.
- 0.75-0.9: logo/trademark clearly visible and unambiguous, or name partly legible.
- 0.5-0.75: distinctive trade dress strongly suggests the brand but no text is legible (evidence "distinctive_design").
- Below 0.5: do not report it.

If there are no identifiable brands, return an empty list.`;

export async function detectBrandsInImage(
  bytes: Uint8Array,
  declaredType?: string,
): Promise<BrandDetection[]> {
  const mediaType = validateImage(bytes, declaredType);
  const data = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
  const raw = await runDetection({
    system: SYSTEM_PROMPT,
    effort: "medium",
    content: [
      { type: "image", source: { type: "base64", media_type: mediaType, data } },
      { type: "text", text: "Identify the consumer brands visible in this photo." },
    ],
  });
  return toBrandDetections(raw, "photo", 0.5);
}

export { DetectionFailedError };
