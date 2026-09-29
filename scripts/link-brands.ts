// Link cases to brands by defendant name (no AI). See src/lib/ingest/link-brands.ts.
//
//   npm run link-brands            only cases with no brand links yet
//   npm run link-brands -- --all   re-check every non-sample case
import { parseArgs } from "./_env";
import { closePool, query } from "@/lib/db";
import { DefendantLinker } from "@/lib/ingest/link-brands";

const args = parseArgs();

async function main() {
  const linker = await DefendantLinker.load();
  const cases = await query<{ id: string; case_name: string }>(
    `SELECT c.id, c.case_name FROM cases c
     WHERE NOT c.is_sample ${args.all ? "" : "AND NOT EXISTS (SELECT 1 FROM case_brands cb WHERE cb.case_id = c.id)"}`,
  );
  let linkedCases = 0;
  let links = 0;
  for (const c of cases) {
    const hits = await linker.link(c.id, c.case_name);
    if (!hits.length) continue;
    linkedCases++;
    links += hits.length;
    console.log(`  ${c.id} ${c.case_name}  ->  ${hits.map((b) => b.name).join(", ")}`);
  }
  console.log(`Checked ${cases.length} cases; linked ${linkedCases} case(s) with ${links} brand link(s).`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(closePool);
