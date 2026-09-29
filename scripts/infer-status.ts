// Re-derive every real case's stage from its stored court filings (no AI; forward-only).
//   npm run infer-status
import "./_env";
import { closePool, query } from "@/lib/db";
import { applyInferredStatus } from "@/lib/repo/ingest";

const CONCURRENCY = 5;

async function main() {
  // Only stages the filings can still move forward from.
  const ids = await query<{ id: string }>(
    "SELECT id FROM cases WHERE NOT is_sample AND status IN ('filed', 'unknown', 'certified')",
  );
  const moved: Record<string, number> = {};
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const results = await Promise.all(ids.slice(i, i + CONCURRENCY).map(({ id }) => applyInferredStatus(id)));
    for (const s of results) if (s) moved[s] = (moved[s] ?? 0) + 1;
  }
  console.log(`Checked ${ids.length} cases; status changes:`, moved);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(closePool);
