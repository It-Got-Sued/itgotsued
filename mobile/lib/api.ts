// Typed client for the ClassActionForMe API (see PLAN.md "API").
// Base URL comes from EXPO_PUBLIC_API_URL (inlined at build time by Expo).
import type {
  BrandDetection,
  BrandMatch,
  CaseDetail,
  CaseSearchParams,
  CaseSearchResult,
  MatchRequest,
} from '@shared/types';

export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000').replace(
  /\/+$/,
  ''
);

const DEFAULT_TIMEOUT_MS = 20_000;
const UPLOAD_TIMEOUT_MS = 60_000;

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** 503 = the server has not configured this feature (e.g. no API key / Plaid keys). */
  get notConfigured(): boolean {
    return this.status === 503;
  }
}

/** Network failure / timeout (status 0). */
export class NetworkError extends ApiError {
  constructor(message = 'Network request failed') {
    super(message, 0);
    this.name = 'NetworkError';
  }
}

/** User-facing message for any error thrown by this client. */
export function messageFor(err: unknown, feature = 'This feature'): string {
  if (err instanceof ApiError) {
    if (err.status === 0)
      return `We couldn't reach the server at ${API_BASE_URL}. Check your connection and try again.`;
    if (err.status === 503)
      return `${feature} isn't available right now — it hasn't been set up on this server yet. You can still search the index or type what you own.`;
    if (err.status === 404) return err.message || "We couldn't find that.";
    if (err.status === 413) return 'That photo is too large. Try a smaller one.';
    if (err.status === 429) return 'Too many requests. Please wait a moment and try again.';
    if (err.status >= 400 && err.status < 500)
      return err.message || "Something about that request wasn't accepted.";
    return 'Something went wrong on our end. Please try again.';
  }
  return 'Something went wrong. Please try again.';
}

async function request<T>(
  path: string,
  init: RequestInit & { json?: unknown; timeoutMs?: number } = {}
): Promise<T> {
  const { json, timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: json !== undefined || rest.body ? 'POST' : 'GET',
      ...rest,
      headers: {
        Accept: 'application/json',
        ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(rest.headers as Record<string, string> | undefined),
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      signal: controller.signal,
    });
  } catch (e) {
    throw new NetworkError(e instanceof Error ? e.message : undefined);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let msg = '';
    try {
      const data = (await res.json()) as { error?: unknown; message?: unknown };
      const m = data.error ?? data.message;
      if (typeof m === 'string') msg = m;
    } catch {
      // non-JSON error body
    }
    throw new ApiError(msg, res.status);
  }
  return (await res.json()) as T;
}

function query(params: object): string {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return qs ? `?${qs}` : '';
}

// ---- Endpoints -------------------------------------------------------------

/** GET /api/cases */
export function searchCases(params: CaseSearchParams = {}): Promise<CaseSearchResult> {
  return request<CaseSearchResult>(`/api/cases${query(params)}`);
}

/** GET /api/cases/[id] */
export function getCase(id: string): Promise<CaseDetail> {
  return request<CaseDetail>(`/api/cases/${encodeURIComponent(id)}`);
}

/** POST /api/detect/text */
export function detectText(description: string): Promise<{ detections: BrandDetection[] }> {
  return request(`/api/detect/text`, { json: { description } });
}

/** POST /api/detect/image (multipart field `image`). `uri` is a local JPEG file URI. */
export function detectImage(uri: string): Promise<{ detections: BrandDetection[] }> {
  const form = new FormData();
  // React Native's FormData accepts { uri, name, type } file descriptors.
  form.append('image', { uri, name: 'scan.jpg', type: 'image/jpeg' } as unknown as Blob);
  return request(`/api/detect/image`, {
    method: 'POST',
    body: form,
    timeoutMs: UPLOAD_TIMEOUT_MS,
  });
}

/** POST /api/plaid/link-token */
export function createPlaidLinkToken(
  platform: 'ios' | 'android' | 'web' = 'ios'
): Promise<{ linkToken: string }> {
  return request(`/api/plaid/link-token`, { json: { platform } });
}

/** POST /api/plaid/scan */
export function plaidScan(publicToken: string): Promise<{ detections: BrandDetection[] }> {
  return request(`/api/plaid/scan`, { json: { publicToken }, timeoutMs: UPLOAD_TIMEOUT_MS });
}

/** POST /api/match */
export function matchBrands(body: MatchRequest): Promise<{ matches: BrandMatch[] }> {
  return request(`/api/match`, { json: body });
}

/** POST /api/watchlist */
export function followBrand(email: string, brand: string): Promise<{ ok: boolean }> {
  return request(`/api/watchlist`, { json: { email, brand } });
}
