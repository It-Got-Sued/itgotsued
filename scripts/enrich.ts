// Fill in summary / who qualifies / brands / categories / states / status for ingested cases
// using Claude. Skips (exit 0) when ANTHROPIC_API_KEY is unset. Sample cases are never touched.
//
//   npm run enrich -- --limit 10
//
// Flags:
//   --limit N     max cases (default 20)
//   --id ID       enrich specific case id(s), comma-separated (implies --force for those)
//   --force       re-enrich cases that already have a summary and brands
//   --no-pdf      do not attach the complaint PDF (docket text only; cheaper)
//   --prune       delete cases the model judges are not class actions
import { parseArgs } from "./_env";
import { enrichPending } from "@/lib/ingest/enrich";
import { closePool } from "@/lib/db";

const args = parseArgs();

enrichPending({
  limit: Math.max(1, Number(args.limit ?? 20)),
  force: Boolean(args.force),
  ids: typeof args.id === "string" ? args.id.split(",").map((s) => s.trim()) : undefined,
  includePdf: !args["no-pdf"],
  prune: Boolean(args.prune),
})
  .then((s) =>
    console.log(
      `Done: ${s.enriched} enriched, ${s.skipped} skipped, ${s.failed} failed, ${s.pruned} pruned.`,
    ),
  )
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(closePool);
