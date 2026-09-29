// Seed FICTIONAL sample cases for local development from data/sample-cases.json.
// Every company and brand in that file is invented; rows get is_sample=1, source='sample'.
//   npm run db:seed   (runs seed-brands, then this)
// Idempotent: cases upsert on (source, slug); docket entries and brand links are replaced.
import "./_env";
import fs from "node:fs";
import { getDb } from "@/lib/db";
import { getBrandByNormalized, normalizeBrandKey, upsertBrand } from "@/lib/repo/brands";
import {
  linkCaseBrand,
  replaceDocketEntries,
  updateCaseFields,
  upsertCaseRecord,
} from "@/lib/repo/ingest";
import type { CaseStatus } from "@/lib/types";

interface SampleFile {
  brands: { name: string; parentCompany: string; category: string; aliases: string[] }[];
  cases: {
    slug: string;
    caseName: string;
    court: string;
    docketNumber: string;
    dateFiled: string;
    status: CaseStatus;
    natureOfSuit: string | null;
    summary: string | null;
    whoQualifies: string | null;
    claimUrl: string | null;
    claimDeadline: string | null;
    settlementAmount: string | null;
    states: string[];
    categories: string[];
    brands: { name: string; products: string[] }[];
    docketEntries: { entryNumber: number; dateFiled: string; description: string }[];
  }[];
}

const data = JSON.parse(fs.readFileSync("data/sample-cases.json", "utf8")) as SampleFile;
const db = getDb();
const sampleBrandKeys = new Set<string>();

db.exec("BEGIN");
try {
  for (const b of data.brands) {
    const normalized = normalizeBrandKey(b.name);
    sampleBrandKeys.add(normalized);
    upsertBrand({ ...b, normalized });
  }

  const now = new Date().toISOString();
  for (const c of data.cases) {
    const id = upsertCaseRecord({
      id: `sample-${c.slug}`,
      source: "sample",
      sourceId: c.slug,
      sourceUrl: null,
      caseName: c.caseName,
      court: c.court,
      docketNumber: c.docketNumber,
      dateFiled: c.dateFiled,
      status: c.status,
      natureOfSuit: c.natureOfSuit,
      isSample: true,
    });
    updateCaseFields(id, {
      status: c.status,
      summary: c.summary,
      whoQualifies: c.whoQualifies,
      claimUrl: c.claimUrl,
      claimDeadline: c.claimDeadline,
      settlementAmount: c.settlementAmount,
      states: c.states,
      categories: c.categories,
      lastChecked: now,
    });
    replaceDocketEntries(
      id,
      c.docketEntries.map((e) => ({ ...e, documentUrl: null })),
    );
    db.prepare("DELETE FROM case_brands WHERE case_id = $id").run({ id });
    for (const b of c.brands) {
      const key = normalizeBrandKey(b.name);
      // Guard: sample lawsuits may only ever link to the fictional sample brands.
      if (!sampleBrandKeys.has(key)) throw new Error(`Sample case ${c.slug} links non-sample brand ${b.name}`);
      const brand = getBrandByNormalized(key)!;
      linkCaseBrand(id, brand.id, "defendant", b.products);
    }
  }
  db.exec("COMMIT");
} catch (err) {
  db.exec("ROLLBACK");
  throw err;
}

const statuses = [...new Set(data.cases.map((c) => c.status))].join(", ");
console.log(
  `Seeded ${data.cases.length} SAMPLE cases and ${data.brands.length} fictional brands (statuses: ${statuses})`,
);
