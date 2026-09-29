import { DetectionFailedError, DetectionUnavailableError } from "./claude";
import { ImageValidationError } from "./detect-image";

// Shared error -> Response mapping for the brand routes. Never echoes user content.
export function errorResponse(err: unknown): Response {
  if (err instanceof ImageValidationError || err instanceof DetectionFailedError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof DetectionUnavailableError) {
    return Response.json({ error: err.message }, { status: 503 });
  }
  console.error("[brands] unexpected error:", err instanceof Error ? err.name : typeof err);
  return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

export function badRequest(message: string, issues?: unknown): Response {
  return Response.json(issues ? { error: message, issues } : { error: message }, { status: 400 });
}
