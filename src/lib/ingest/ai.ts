// Language model lookup for ingest. Model ids are "<provider>/<model>":
//   deepseek/<model>   DeepSeek API directly (DEEPSEEK_API_KEY), e.g. deepseek/deepseek-v4-pro
//   anything else      Vercel AI Gateway (AI_GATEWAY_API_KEY), e.g. anthropic/claude-sonnet-5.5
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createGateway, type LanguageModel } from "ai";

export const DEFAULT_MODEL = "deepseek/deepseek-v4-pro";

/** Gateway API key. AI_GATEWAY_API_KEY is the standard name; AI_GATEWAY_URL is accepted
 *  when it holds a key rather than a URL (how .env.local currently stores it). */
export function gatewayApiKey(): string | undefined {
  const key = process.env.AI_GATEWAY_API_KEY?.trim();
  if (key) return key;
  const legacy = process.env.AI_GATEWAY_URL?.trim();
  return legacy && !/^https?:\/\//i.test(legacy) ? legacy : undefined;
}

const isDeepSeek = (id: string) => id.startsWith("deepseek/");

/** Why `id` cannot run, or null when its provider has credentials. */
export function missingCredentials(id: string): string | null {
  if (isDeepSeek(id)) return process.env.DEEPSEEK_API_KEY?.trim() ? null : "DEEPSEEK_API_KEY is not set";
  return gatewayApiKey() || process.env.VERCEL_OIDC_TOKEN ? null : "AI_GATEWAY_API_KEY is not set";
}

export function languageModel(id: string): LanguageModel {
  if (isDeepSeek(id)) {
    return createDeepSeek({ apiKey: process.env.DEEPSEEK_API_KEY?.trim() })(id.slice("deepseek/".length));
  }
  return createGateway({ apiKey: gatewayApiKey() })(id);
}
