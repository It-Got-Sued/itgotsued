// POST /api/plaid/link-token  body: { platform?: "web" | "ios" | "android" }
// Returns { linkToken, expiration }. Anonymous: client_user_id is a fresh UUID.

import { tierDeniedResponse } from "@/lib/auth/session";
import { z } from "zod";
import {
  NOT_CONFIGURED_MESSAGE,
  getPlaidClient,
  getPlaidConfig,
  toBankScanError,
} from "@/lib/plaid/client";
import { createLinkToken } from "@/lib/plaid/link-token";
import {
  clientKey,
  createRateLimiter,
  errorJson,
  json,
  readJsonBody,
  tooManyRequests,
} from "@/lib/plaid/http";

const Body = z
  .object({ platform: z.enum(["web", "ios", "android"]).optional() })
  .strict();

const limiter = createRateLimiter(10, 10 * 60_000); // 10 per IP per 10 min

export async function POST(request: Request) {
  const denied = await tierDeniedResponse("pro");
  if (denied) return denied;
  const config = getPlaidConfig();
  if (!config) return errorJson(503, NOT_CONFIGURED_MESSAGE);

  const rl = limiter.check(clientKey(request));
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  const parsed = Body.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return errorJson(400, 'Invalid body. Expected { platform?: "web" | "ios" | "android" }.');
  }

  try {
    const token = await createLinkToken(
      getPlaidClient(config),
      config,
      parsed.data.platform ?? "web",
    );
    return json(token);
  } catch (err) {
    const e = toBankScanError(err);
    console.error("[plaid] link token failed", e.code);
    return errorJson(e.status === 400 ? 502 : e.status, "Could not start the bank connection. Please try again.");
  }
}
