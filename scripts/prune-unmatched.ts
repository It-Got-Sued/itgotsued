// Remove real cases filed on/after --filed-since that a full ingest run starting at
// --checked-before did NOT touch: they came from an older, looser search and no longer
// match the class action query.
//   npx tsx scripts/prune-unmatched.ts --filed-since 2026-01-01 --checked-before 2026-09-29T00:00:00Z [--dry-run]
import { parseArgs } from "./_env";
import { closePool, query } from "@/lib/db";

const args = parseArgs();

async function main() {
  const filedSince = String(args["filed-since"] ?? "");
  const checkedBefore = String(args["checked-before"] ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(filedSince) || Number.isNaN(Date.parse(checkedBefore))) {
    throw new Error("Usage: --filed-since YYYY-MM-DD --checked-before <ISO timestamp> [--dry-run]");
  }
  const where = `NOT is_sample AND source = 'courtlistener' AND date_filed >= $1 AND last_checked < $2`;
  const [{ n }] = await query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM cases WHERE ${where}`, [filedSince, checkedBefore]);
  if (args["dry-run"]) {
    const sample = await query(`SELECT case_name, nature_of_suit FROM cases WHERE ${where} LIMIT 15`, [filedSince, checkedBefore]);
    console.log(`Would delete ${n} cases, e.g.:`, sample.map((r) => `${r.nature_of_suit ?? "-"} | ${r.case_name}`));
    return;
  }
  await query(`DELETE FROM cases WHERE ${where}`, [filedSince, checkedBefore]);
  console.log(`Deleted ${n} cases that no longer match the class action search.`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(closePool);
