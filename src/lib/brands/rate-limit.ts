// Simple in-memory fixed-window rate limiter keyed by client IP. Per-process only: fine for
// a single Node server; use a shared store (Redis/Upstash) when running multiple instances.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Map<string, Bucket>>();
let lastSweep = 0;

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(name: string, key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);
  let scope = buckets.get(name);
  if (!scope) buckets.set(name, (scope = new Map()));
  let bucket = scope.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    scope.set(key, bucket);
  }
  bucket.count++;
  return {
    ok: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const scope of buckets.values()) {
    for (const [k, b] of scope) if (b.resetAt <= now) scope.delete(k);
  }
}

/** Best-effort client IP from proxy headers (first hop of x-forwarded-for). */
export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim() || "unknown";
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function tooManyRequests(r: RateLimitResult): Response {
  return Response.json(
    { error: "Too many requests. Please wait a moment and try again." },
    { status: 429, headers: { "Retry-After": String(r.retryAfterSeconds) } },
  );
}

/** For tests. */
export function resetRateLimits(): void {
  buckets.clear();
}
