// Simulate "I own <subsidiary brand>" searches against the live database and show when the
// matcher climbs to the parent company, and whether each parent lawsuit applies.
//
//   npx tsx scripts/simulate-parent-search.ts [brand ...]
import "./_env";
import { closePool } from "@/lib/db";
import { matchDetections } from "@/lib/brands/match";
import { getBrandIndex, parentBrandsOf } from "@/lib/brands/brand-index";
import { getCaseEvidence } from "@/lib/repo/cases";
import { findCasesByBrandIds } from "@/lib/repo/cases";

const DEFAULT = ["Gatorade", "Cheetos", "Capital One credit card", "Discover card", "Hulu", "Dasani", "Chobani yogurt", "PepsiCo"];

async function main() {
  const terms = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT;
  const index = await getBrandIndex();

  for (const term of terms) {
    console.log(`\n━━ User owns: "${term}"`);
    const matches = await matchDetections([{ brand: term, confidence: 1, source: "manual" }]);

    // Show the ownership chain the matcher walked, and every parent lawsuit it considered.
    const direct = matches.find((m) => m.relation === "direct")?.brand
      ?? index.brands.find((b) => b.name.toLowerCase() === term.toLowerCase());
    if (direct) {
      const parents = parentBrandsOf(index, direct);
      console.log(`   brand: ${direct.name}${parents.length ? `  ⟶ owned by ${parents.map((p) => p.name).join(", ")}` : "  (no parent company on file)"}`);
      const parentCases = await findCasesByBrandIds(parents.map((p) => p.id));
      const all = [...parentCases.values()].flat();
      const ev = await getCaseEvidence(all.map((c) => c.id));
      for (const c of all) {
        const text = ev.get(c.id)?.text ?? "";
        const shown = matches.some((m) => m.cases.some((x) => x.id === c.id));
        console.log(`     parent lawsuit: ${c.caseName}`);
        console.log(`       ${shown ? "✔ APPLIES" : "✘ skipped"} — filings: "${text.replace(/\s+/g, " ").slice(0, 110)}…"`);
      }
    }

    if (!matches.length) console.log("   RESULT: no lawsuits apply");
    for (const m of matches) {
      const label =
        m.relation === "direct" ? "direct" :
        m.relation === "parent" ? `parent company (via ${m.via?.join(", ")})` :
        `subsidiary of ${m.via?.join(", ")}`;
      console.log(`   RESULT ${m.brand.name} [${label}]`);
      for (const c of m.cases) {
        const why = m.mentions?.[c.id] ? `  ← filings name "${m.mentions[c.id]}"` : "";
        console.log(`     • ${c.caseName}${why}`);
      }
      if (m.unverifiedCount) console.log(`     (${m.unverifiedCount} other ${m.brand.name} lawsuit(s) hidden: filings don't name ${m.via?.join(", ")})`);
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closePool);
