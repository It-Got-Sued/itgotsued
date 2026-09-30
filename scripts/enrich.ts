// Fill in summary / who qualifies / brands / categories / states / status for ingested cases
// using DeepSeek or the Vercel AI Gateway. The model reads the complaint PDF from CourtListener, or other
// filings when the complaint is not there, and a readable complaint also gets a full complaint
// analysis. Skips (exit 0) when the model provider key is unset. Sample cases are never touched.
//
//   npm run enrich -- --limit 10
//
// Flags:
//   --limit N     max cases (default 20)
//   --id ID       enrich specific case id(s), comma-separated (implies --force for those)
//   --force       re-enrich cases that already have a summary and brands
//   --no-pdf      do not read court filings (docket text only; cheaper)
//   --prune       delete cases the model judges are not class actions
//   --model ID    model id, e.g. deepseek/deepseek-v4-pro or anthropic/claude-sonnet-5.5 via the gateway
//                 (default $ENRICH_MODEL or deepseek/deepseek-v4-pro)
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
  model: typeof args.model === "string" ? args.model : undefined,
})
  .then((s) =>
    console.log(
      `Done: ${s.enriched} enriched, ${s.analyzed} complaints analyzed, ${s.skipped} skipped, ${s.failed} failed, ${s.pruned} pruned.`,
    ),
  )
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(closePool);
