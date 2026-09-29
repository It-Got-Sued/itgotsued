// Plaid client + configuration. Server-only.
//
// Privacy: never log the client, its config, or any axios error object from it —
// axios errors carry request headers (PLAID-SECRET) and bodies (access_token).
// Use `plaidErrorCode()` to extract a safe, token-free error code instead.

import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

export type PlaidEnvName = "sandbox" | "production";

export interface PlaidConfig {
  clientId: string;
  secret: string;
  env: PlaidEnvName;
  redirectUri: string | null; // web (redirect mode) + iOS universal link
  androidPackageName: string | null;
}

/** Returns null when Plaid is not configured (routes respond 503). */
export function getPlaidConfig(): PlaidConfig | null {
  const clientId = process.env.PLAID_CLIENT_ID?.trim();
  const secret = process.env.PLAID_SECRET?.trim();
  if (!clientId || !secret) return null;
  const rawEnv = (process.env.PLAID_ENV ?? "sandbox").trim().toLowerCase();
  if (rawEnv !== "sandbox" && rawEnv !== "production") return null;
  return {
    clientId,
    secret,
    env: rawEnv,
    redirectUri: process.env.PLAID_REDIRECT_URI?.trim() || null,
    androidPackageName: process.env.PLAID_ANDROID_PACKAGE?.trim() || null,
  };
}

export const NOT_CONFIGURED_MESSAGE =
  "Bank scan is not available: Plaid is not configured on this server " +
  "(set PLAID_CLIENT_ID, PLAID_SECRET and PLAID_ENV=sandbox|production).";

let cached: { key: string; api: PlaidApi } | null = null;

export function getPlaidClient(config: PlaidConfig): PlaidApi {
  const key = `${config.env}:${config.clientId}:${config.secret}`;
  if (cached?.key === key) return cached.api;
  const api = new PlaidApi(
    new Configuration({
      basePath: PlaidEnvironments[config.env],
      baseOptions: {
        timeout: 15_000,
        headers: {
          "PLAID-CLIENT-ID": config.clientId,
          "PLAID-SECRET": config.secret,
        },
      },
    }),
  );
  cached = { key, api };
  return api;
}

/** Extracts Plaid's `error_code` (e.g. PRODUCT_NOT_READY) without touching tokens. */
export function plaidErrorCode(err: unknown): string | null {
  if (typeof err !== "object" || err === null) return null;
  const data = (err as { response?: { data?: unknown } }).response?.data;
  if (typeof data === "object" && data !== null) {
    const code = (data as { error_code?: unknown }).error_code;
    if (typeof code === "string") return code;
  }
  const axiosCode = (err as { code?: unknown }).code;
  if (axiosCode === "ECONNABORTED" || axiosCode === "ETIMEDOUT") return "TIMEOUT";
  return null;
}

/** Safe-to-surface error for the scan/link routes. Never contains tokens or data. */
export class BankScanError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "BankScanError";
  }
}

export function toBankScanError(err: unknown): BankScanError {
  if (err instanceof BankScanError) return err;
  const code = plaidErrorCode(err) ?? "UNKNOWN";
  switch (code) {
    case "INVALID_PUBLIC_TOKEN":
      return new BankScanError(
        400,
        "The bank connection expired or was already used. Please connect again.",
        code,
      );
    case "PRODUCT_NOT_READY":
    case "TIMEOUT":
      return new BankScanError(
        504,
        "Your bank is still preparing transactions. Please try the scan again in a minute.",
        code,
      );
    case "ITEM_LOGIN_REQUIRED":
    case "INSUFFICIENT_CREDENTIALS":
      return new BankScanError(409, "Your bank asked you to sign in again. Please reconnect.", code);
    case "RATE_LIMIT_EXCEEDED":
    case "TRANSACTIONS_LIMIT":
    case "TRANSACTIONS_SYNC_LIMIT":
      return new BankScanError(429, "The bank scan is busy. Please try again shortly.", code);
    case "INSTITUTION_DOWN":
    case "INSTITUTION_NOT_RESPONDING":
    case "INSTITUTION_NOT_AVAILABLE":
      return new BankScanError(502, "Your bank is not responding right now. Please try later.", code);
    default:
      return new BankScanError(502, "The bank scan failed. Please try again.", code);
  }
}
