// Read each case's complaint PDF and store an AI summary, allegations, class definition and
// estimated payout in complaint_analyses. Each complaint is read once; scanned/empty PDFs
// are recorded as unparseable. Skips (exit 0) when the AI Gateway key is unset.
//
//   npm run parse-complaints -- --limit 10
//
// Flags:
//   --limit N       max complaints (default 20)
//   --case-id ID    parse specific case id(s), comma-separated (re-parses them)
//   --force         re-parse complaints that already have an analysis
//   --model ID      gateway model id (default $COMPLAINT_SUMMARY_MODEL or anthropic/claude-sonnet-5.5)
import { parseArgs } from "./_env";
import { parsePendingComplaints } from "@/lib/ingest/complaint";
import { closePool } from "@/lib/db";

const args = parseArgs();
const ids = typeof args["case-id"] === "string" ? args["case-id"].split(",").map((s) => s.trim()) : undefined;

parsePendingComplaints({
  limit: Math.max(1, Number(args.limit ?? (ids ? ids.length : 20))),
  ids,
  force: Boolean(args.force) || Boolean(ids),
  model: typeof args.model === "string" ? args.model : undefined,
})
  .then((s) =>
    console.log(`Done: ${s.parsed} parsed, ${s.unparseable} unparseable, ${s.skipped} skipped, ${s.failed} failed.`),
  )
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(closePool);
