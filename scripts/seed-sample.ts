// Seed FICTIONAL sample cases for local development from data/sample-cases.json.
// Every company and brand in that file is invented; rows get is_sample=1, source='sample'.
//   npm run db:seed   (runs seed-brands, then this)
// Idempotent: cases upsert on (source, slug); docket entries and brand links are replaced.
// Not part of the production seed: run `npm run db:seed:sample` for local development only.
import "./_env";
import fs from "node:fs";
import { closePool } from "@/lib/db";
import { getBrandByNormalized, normalizeBrandKey, upsertBrand } from "@/lib/repo/brands";
import {
  clearCaseBrands,
  linkCaseBrand,
  replaceDocketEntries,
  updateCaseFields,
  upsertCaseRecord,
} from "@/lib/repo/ingest";
import type { CaseStatus, ProofOfPurchase } from "@/lib/types";

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
    proofOfPurchase?: ProofOfPurchase;
    noProofPayout?: string | null;
    states: string[];
    categories: string[];
    brands: { name: string; products: string[] }[];
    docketEntries: { entryNumber: number; dateFiled: string; description: string }[];
  }[];
}

const data = JSON.parse(fs.readFileSync("data/sample-cases.json", "utf8")) as SampleFile;
const sampleBrandKeys = new Set<string>();

async function main() {
  for (const b of data.brands) {
    const normalized = normalizeBrandKey(b.name);
    sampleBrandKeys.add(normalized);
    await upsertBrand({ ...b, normalized, isSample: true });
  }

  const now = new Date().toISOString();
  for (const c of data.cases) {
    const id = await upsertCaseRecord({
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
    await updateCaseFields(id, {
      status: c.status,
      summary: c.summary,
      whoQualifies: c.whoQualifies,
      claimUrl: c.claimUrl,
      claimDeadline: c.claimDeadline,
      settlementAmount: c.settlementAmount,
      proofOfPurchase: c.proofOfPurchase ?? "unknown",
      noProofPayout: c.noProofPayout ?? null,
      states: c.states,
      categories: c.categories,
      lastChecked: now,
    });
    await replaceDocketEntries(
      id,
      c.docketEntries.map((e) => ({ ...e, documentUrl: null })),
    );
    await clearCaseBrands(id);
    for (const b of c.brands) {
      const key = normalizeBrandKey(b.name);
      // Guard: sample lawsuits may only ever link to the fictional sample brands.
      if (!sampleBrandKeys.has(key)) throw new Error(`Sample case ${c.slug} links non-sample brand ${b.name}`);
      const brand = (await getBrandByNormalized(key))!;
      await linkCaseBrand(id, brand.id, "defendant", b.products);
    }
  }
  const statuses = [...new Set(data.cases.map((c) => c.status))].join(", ");
  console.log(
    `Seeded ${data.cases.length} SAMPLE cases and ${data.brands.length} fictional brands (statuses: ${statuses})`,
  );
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(closePool);
