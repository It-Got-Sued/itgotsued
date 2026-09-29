// Tiny fetch wrapper for client components. Turns API failures into
// user-facing messages, with a specific message for 503 (feature not configured).

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export function messageFor(err: unknown, feature = "This feature"): string {
  if (err instanceof ApiError) {
    if (err.status === 503)
      return `${feature} isn't available right now — it hasn't been set up on this server yet. You can still search the index or type what you own.`;
    if (err.status === 413) return "That file is too large. Try a smaller photo.";
    if (err.status === 429) return "Too many requests. Please wait a moment and try again.";
    if (err.status >= 400 && err.status < 500) return err.message || "Something about that request wasn't accepted.";
    return "Something went wrong on our end. Please try again.";
  }
  return "We couldn't reach the server. Check your connection and try again.";
}

export async function apiFetch<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(path, {
    method: json !== undefined || rest.body ? "POST" : "GET",
    ...rest,
    headers: json !== undefined ? { "Content-Type": "application/json", ...rest.headers } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (!res.ok) {
    let msg = "";
    try {
      const data = (await res.json()) as { error?: unknown; message?: unknown };
      const m = data.error ?? data.message;
      if (typeof m === "string") msg = m;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(msg, res.status);
  }
  return (await res.json()) as T;
}
