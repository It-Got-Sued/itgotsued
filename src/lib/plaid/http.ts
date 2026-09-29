// Route helpers for /api/plaid/*: per-IP rate limiting and no-store JSON.
// The rate limiter is in-memory (per server instance) and keeps only a hashed IP
// key plus timestamps for the current window; nothing is logged or persisted.

import { createHash } from "node:crypto";

type Bucket = { hits: number[] };

export interface RateLimiter {
  check(key: string): { ok: true } | { ok: false; retryAfterSec: number };
}

export function createRateLimiter(limit: number, windowMs: number): RateLimiter {
  const buckets = new Map<string, Bucket>();
  let lastSweep = Date.now();

  return {
    check(key) {
      const now = Date.now();
      if (now - lastSweep > windowMs) {
        for (const [k, b] of buckets) {
          if (b.hits.every((t) => now - t >= windowMs)) buckets.delete(k);
        }
        lastSweep = now;
      }
      const b = buckets.get(key) ?? { hits: [] };
      b.hits = b.hits.filter((t) => now - t < windowMs);
      if (b.hits.length >= limit) {
        buckets.set(key, b);
        return { ok: false, retryAfterSec: Math.ceil((windowMs - (now - b.hits[0])) / 1000) };
      }
      b.hits.push(now);
      buckets.set(key, b);
      return { ok: true };
    },
  };
}

/** Hashed client IP (first X-Forwarded-For hop). Raw IPs are never stored. */
export function clientKey(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = fwd || request.headers.get("x-real-ip")?.trim() || "unknown";
  return createHash("sha256").update(ip).digest("base64url").slice(0, 22);
}

const NO_STORE = { "Cache-Control": "no-store" };

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

export function errorJson(status: number, error: string, headers: Record<string, string> = {}) {
  return json({ error }, status, headers);
}

export function tooManyRequests(retryAfterSec: number): Response {
  return errorJson(429, "Too many bank scan requests. Please wait a few minutes and try again.", {
    "Retry-After": String(retryAfterSec),
  });
}

/** Parses a JSON body; empty body -> {}. Returns undefined on malformed JSON. */
export async function readJsonBody(request: Request): Promise<unknown | undefined> {
  const text = await request.text();
  if (text.length > 10_000) return undefined;
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
