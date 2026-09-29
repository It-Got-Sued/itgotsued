import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";
import type { BrandDetection, DetectionSource } from "@/lib/types";

// Shared Claude plumbing for brand detection (photo + text).

export const DETECTION_MODEL = "claude-opus-5-5";

export class DetectionUnavailableError extends Error {
  constructor(message = "Brand detection is not configured (ANTHROPIC_API_KEY is missing).") {
    super(message);
    this.name = "DetectionUnavailableError";
  }
}

export class DetectionFailedError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
    this.name = "DetectionFailedError";
  }
}

export function hasAnthropicKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

let client: Anthropic | null = null;
export function getClient(): Anthropic {
  if (!hasAnthropicKey()) throw new DetectionUnavailableError();
  // Timeout in ms; 2 SDK retries on 429/5xx/connection errors.
  if (!client) client = new Anthropic({ timeout: 90_000, maxRetries: 2 });
  return client;
}

// Structured output schema. Numeric bounds are enforced after parsing (clamped),
// not in the JSON schema, to stay within structured-output schema support.
export const DetectionOutputSchema = z.object({
  detections: z.array(
    z.object({
      brand: z.string().describe("Brand name as printed on the product, e.g. 'Coca-Cola', 'CeraVe'"),
      product: z
        .string()
        .describe("Specific product, e.g. 'Diet Coke can', 'CeraVe Moisturizing Cream'. Empty string if unknown."),
      category: z
        .string()
        .describe("One or two words, e.g. 'beverage', 'skincare', 'supplement', 'electronics'"),
      confidence: z.number().describe("Calibrated probability 0..1 that this brand is present/owned"),
      evidence: z
        .enum(["readable_text", "logo", "distinctive_design", "stated_by_user"])
        .describe("What the identification is based on"),
    }),
  ),
});
type DetectionOutput = z.infer<typeof DetectionOutputSchema>;

type UserContent = Anthropic.Beta.BetaContentBlockParam[];

/**
 * One structured-output call. Opts into server-side refusal fallbacks ("default" mode),
 * and never logs request content (photos/descriptions are user data).
 */
export async function runDetection(opts: {
  system: string;
  content: UserContent;
  effort: "low" | "medium" | "high";
}): Promise<DetectionOutput["detections"]> {
  const anthropic = getClient();
  let response;
  try {
    response = await anthropic.beta.messages.parse({
      model: DETECTION_MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: opts.system,
      output_config: { effort: opts.effort, format: betaZodOutputFormat(DetectionOutputSchema) },
      messages: [{ role: "user", content: opts.content }],
    });
  } catch (err) {
    if (err instanceof Anthropic.BadRequestError) {
      throw new DetectionFailedError("The detection service rejected this input.", 422);
    }
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      throw new DetectionUnavailableError("Brand detection is misconfigured (API key rejected).");
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new DetectionFailedError("Detection is busy right now. Please try again shortly.", 503);
    }
    if (err instanceof Anthropic.APIError) {
      console.error(`[brands] detection API error status=${err.status ?? "n/a"}`);
      throw new DetectionFailedError("Brand detection failed. Please try again.", 502);
    }
    throw err;
  }

  if (response.stop_reason === "refusal") {
    throw new DetectionFailedError("This input could not be analyzed.", 422);
  }
  if (response.stop_reason === "max_tokens" || !response.parsed_output) {
    throw new DetectionFailedError("Brand detection returned an incomplete result.", 502);
  }
  return response.parsed_output.detections;
}

const EVIDENCE_CAP: Record<string, number> = {
  readable_text: 1,
  logo: 0.95,
  stated_by_user: 0.95,
  distinctive_design: 0.7,
};

/** Clamp, cap by evidence type, drop empties/low-confidence, and dedupe by brand+product. */
export function toBrandDetections(
  raw: DetectionOutput["detections"],
  source: DetectionSource,
  minConfidence = 0.3,
): BrandDetection[] {
  const seen = new Map<string, BrandDetection>();
  for (const d of raw) {
    const brand = d.brand.trim().slice(0, 120);
    if (!brand) continue;
    let confidence = Number.isFinite(d.confidence) ? d.confidence : 0;
    if (confidence > 1 && confidence <= 100) confidence /= 100; // tolerate percentages
    confidence = Math.min(Math.max(confidence, 0), EVIDENCE_CAP[d.evidence] ?? 0.7);
    if (confidence < minConfidence) continue;
    const product = d.product.trim().slice(0, 160) || undefined;
    const category = d.category.trim().toLowerCase().slice(0, 60) || undefined;
    const key = `${brand.toLowerCase()}|${(product ?? "").toLowerCase()}`;
    const prev = seen.get(key);
    if (!prev || prev.confidence < confidence) {
      seen.set(key, { brand, product, category, confidence: round2(confidence), source });
    }
  }
  return [...seen.values()].sort((a, b) => b.confidence - a.confidence);
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
