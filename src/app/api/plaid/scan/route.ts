// POST /api/plaid/scan  body: { publicToken }
// Exchanges the token, reads up to 24 months of transactions in memory, removes
// the Plaid Item (always), and returns { detections: BrandDetection[] } only.
// No amounts, dates, or account data leave this handler; nothing is stored or logged.

import { subscriberOnlyResponse } from "@/lib/auth/session";
import { z } from "zod";
import {
  BankScanError,
  NOT_CONFIGURED_MESSAGE,
  getPlaidClient,
  getPlaidConfig,
} from "@/lib/plaid/client";
import { runBankScan } from "@/lib/plaid/scan";
import {
  clientKey,
  createRateLimiter,
  errorJson,
  json,
  readJsonBody,
  tooManyRequests,
} from "@/lib/plaid/http";

// Transactions polling budget is ~30s; allow headroom for exchange + removal.
export const maxDuration = 60;

const Body = z
  .object({
    publicToken: z
      .string()
      .max(256)
      .regex(/^public-[a-z]+-[A-Za-z0-9-]+$/, "Invalid public token"),
  })
  .strict();

const limiter = createRateLimiter(5, 10 * 60_000); // 5 scans per IP per 10 min

export async function POST(request: Request) {
  const denied = await subscriberOnlyResponse();
  if (denied) return denied;
  const config = getPlaidConfig();
  if (!config) return errorJson(503, NOT_CONFIGURED_MESSAGE);

  const rl = limiter.check(clientKey(request));
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  const parsed = Body.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return errorJson(400, "Invalid body. Expected { publicToken: string } from Plaid Link.");
  }

  try {
    const detections = await runBankScan(getPlaidClient(config), parsed.data.publicToken);
    return json({ detections });
  } catch (err) {
    const e = err instanceof BankScanError ? err : new BankScanError(500, "The bank scan failed.", "INTERNAL");
    console.error("[plaid] scan failed", e.code);
    return errorJson(e.status, e.message);
  }
}
