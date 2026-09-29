// /link/token/create for an anonymous, one-time scan.
// See https://plaid.com/docs/api/link/#linktokencreate and https://plaid.com/docs/link/oauth/

import { randomUUID } from "node:crypto";
import { CountryCode, Products, type LinkTokenCreateRequest, type PlaidApi } from "plaid";
import type { PlaidConfig } from "./client";
import { DAYS_REQUESTED } from "./fetch-transactions";

export type LinkPlatform = "web" | "ios" | "android";

export function buildLinkTokenRequest(
  config: PlaidConfig,
  platform: LinkPlatform,
): LinkTokenCreateRequest {
  const req: LinkTokenCreateRequest = {
    client_name: "ClassActionForMe",
    language: "en",
    country_codes: [CountryCode.Us],
    // Random per request: we have no user accounts and never link scans together.
    user: { client_user_id: randomUUID() },
    products: [Products.Transactions],
    transactions: { days_requested: DAYS_REQUESTED },
  };

  if (platform === "android") {
    // Android: Plaid derives the redirect from the registered package name.
    // redirect_uri and android_package_name are mutually exclusive.
    if (config.androidPackageName) req.android_package_name = config.androidPackageName;
  } else if (config.redirectUri) {
    // iOS: required for OAuth banks; must be an https universal link registered
    // in the Plaid Dashboard. Web: optional (popup works without it) but enables
    // OAuth from in-app webviews / redirect mode.
    req.redirect_uri = config.redirectUri;
  }
  return req;
}

export async function createLinkToken(
  client: Pick<PlaidApi, "linkTokenCreate">,
  config: PlaidConfig,
  platform: LinkPlatform,
): Promise<{ linkToken: string; expiration: string }> {
  const { data } = await client.linkTokenCreate(buildLinkTokenRequest(config, platform));
  return { linkToken: data.link_token, expiration: data.expiration };
}
