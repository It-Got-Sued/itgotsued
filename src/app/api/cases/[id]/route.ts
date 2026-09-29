import { getCase } from "@/lib/repo/cases";
import type { CaseDetail } from "@/lib/types";

export const runtime = "nodejs";

// GET /api/cases/:id -> CaseDetail | 404
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id || id.length > 200) {
    return Response.json({ error: "Case not found." }, { status: 404 });
  }
  const detail: CaseDetail | null = getCase(id);
  if (!detail) return Response.json({ error: "Case not found." }, { status: 404 });
  return Response.json(detail, { headers: { "Cache-Control": "no-store" } });
}
