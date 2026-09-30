import type { CaseEvidence } from "@/lib/repo/cases";
import { normalizeBrandKey } from "@/lib/repo/brands";
import type { Brand, CaseStatus, CaseSummary } from "@/lib/types";
import { buildBrandIndex } from "../brand-index";
import type { MatchOptions } from "../match";

// Test fixture brands/cases, held in memory (no database). Mirrors the shapes the seeding
// agent produces but is self-contained so tests never depend on seeded data.

const BRANDS: Array<[name: string, parent: string | null, aliases: string[], category: string | null]> = [
  ["The Coca-Cola Company", null, ["Coca-Cola Co", "KO"], "beverage"],
  ["Coca-Cola", "The Coca-Cola Company", ["Coke", "Diet Coke", "Coca Cola"], "beverage"],
  ["Dasani", "The Coca-Cola Company", [], "beverage"],
  ["Minute Maid", "The Coca-Cola Company", [], "beverage"],
  ["Procter & Gamble", null, ["P&G", "Procter and Gamble Co"], "consumer goods"],
  ["Crest", "Procter & Gamble Co.", ["Crest Pro-Health"], "oral care"],
  ["Tide", "Procter & Gamble", [], "laundry"],
  ["Unilever", null, [], "consumer goods"],
  ["Dove", "Unilever", [], "personal care"],
  ["Dover Saddlery", null, [], "retail"],
  ["Nature Made", null, [], "supplement"],
  ["Netflix", null, [], "streaming"],
  ["Amazon", null, ["AMZN", "Amazon.com"], "retail"],
  ["Blue Bottle Coffee", null, ["Blue Bottle"], "beverage"],
  ["Peloton", null, ["Peloton Interactive"], "fitness"],
  ["Cheerios", "General Mills", [], "food"],
  ["Samsung", null, [], "electronics"],
];

const CASES: Array<[id: string, brand: string, status: CaseStatus, date: string]> = [
  ["c-ko-parent", "the-coca-cola-company", "claims_open", "2024-01-01"],
  ["c-coke", "coca-cola", "filed", "2025-02-01"],
  ["c-dasani", "dasani", "filed", "2025-03-01"],
  ["c-dover", "dover-saddlery", "filed", "2025-01-01"],
  ["c-crest", "crest", "claims_closed", "2020-01-01"],
  ["c-pg", "procter-and-gamble", "filed", "2025-04-01"],
  ["c-nature", "nature-made", "settlement_pending", "2025-05-01"],
  ["c-netflix", "netflix", "dismissed", "2021-01-01"],
  ["c-amazon", "amazon", "claims_open", "2025-06-01"],
  ["c-amazon-2", "amazon", "filed", "2025-07-01"],
  ["c-bluebottle", "blue-bottle-coffee", "filed", "2025-08-01"],
  ["c-peloton", "peloton", "certified", "2025-09-01"],
  ["c-unilever", "unilever", "filed", "2025-10-01"],
  ["c-cheerios", "cheerios", "filed", "2025-10-02"],
  ["c-samsung", "samsung", "claims_closed", "2019-10-02"],
];

// Same shape upsertBrand produced: id = brand_<normalized>. Sorted by name like listBrands().
export const fixtureBrands: Brand[] = BRANDS.map(([name, parent, aliases, category]) => {
  const normalized = normalizeBrandKey(name);
  return { id: `brand_${normalized}`, name, normalized, parentCompany: parent, aliases, category };
}).sort((a, b) => a.name.localeCompare(b.name));

export const fixtureIndex = buildBrandIndex(fixtureBrands);

const summary = (id: string, caseName: string, status: CaseStatus, dateFiled: string, brandIds: string[]): CaseSummary => ({
  id,
  caseName,
  court: "N.D. Cal.",
  docketNumber: null,
  dateFiled,
  status,
  summary: null,
  brands: brandIds.map((b) => fixtureIndex.byId.get(b)?.name ?? b),
  claimUrl: null,
  claimDeadline: null,
  proofOfPurchase: "unknown",
  noProofPayout: null,
  isSample: true,
});

const links: Array<{ brandId: string; case: CaseSummary }> = [];
for (const [id, brand, status, date] of CASES) {
  const brandId = `brand_${brand}`;
  links.push({ brandId, case: summary(id, `Doe v. ${brand}`, status, date, [brandId]) });
}
// A case against both Dasani and its parent: must only be shown once.
const shared = summary("c-shared", "Roe v. Dasani & Coca-Cola", "filed", "2025-11-01", [
  "brand_dasani",
  "brand_the-coca-cola-company",
]);
for (const brandId of ["brand_dasani", "brand_the-coca-cola-company"]) links.push({ brandId, case: shared });

/** In-memory equivalent of findCasesByBrandIds (claims_open first, then newest filed). */
export function fixtureCasesByBrand(brandIds: string[]): Map<string, CaseSummary[]> {
  const result = new Map<string, CaseSummary[]>();
  for (const id of brandIds) result.set(id, []);
  const ordered = [...links].sort(
    (a, b) =>
      Number(b.case.status === "claims_open") - Number(a.case.status === "claims_open") ||
      (b.case.dateFiled ?? "").localeCompare(a.case.dateFiled ?? ""),
  );
  for (const l of ordered) result.get(l.brandId)?.push(l.case);
  return result;
}

/**
 * Filing text for parent-company cases, so the "parent lawsuit must name the brand" rule has
 * something to read. c-ko-parent names Dasani and Coca-Cola; c-pg names Crest but not Tide;
 * c-unilever names no brand.
 */
export const FIXTURE_FILINGS: Record<string, string> = {
  "c-ko-parent": "CLASS ACTION COMPLAINT against The Coca-Cola Company regarding Dasani and Coca-Cola labeling",
  "c-pg": "COMPLAINT against The Procter & Gamble Co. concerning Crest toothpaste whitening claims",
  "c-unilever": "COMPLAINT against Unilever United States, Inc.",
};

/** In-memory equivalent of getCaseEvidence. */
export function fixtureCaseEvidence(caseIds: string[]): Map<string, CaseEvidence> {
  const byId = new Map(links.map((l) => [l.case.id, l.case]));
  return new Map(
    caseIds.map((id) => [
      id,
      { text: `${byId.get(id)?.caseName ?? ""} ${FIXTURE_FILINGS[id] ?? ""}`, enriched: false },
    ]),
  );
}

/** matchDetections options wired to the fixtures; spread extra options over it. */
export function fixtureOptions(extra: MatchOptions = {}): MatchOptions {
  return { index: fixtureIndex, casesByBrand: fixtureCasesByBrand, caseEvidence: fixtureCaseEvidence, ...extra };
}

/**
 * For code paths with no injection point (detectBrandsInText -> getBrandIndex -> listBrands):
 * install a stub pg Pool on the global slot getPool() reads, serving only the brands listing
 * from the fixtures. Any other query throws, so nothing silently touches a real database.
 */
export function installFixturePool(): void {
  const rows = fixtureBrands.map((b) => ({
    id: b.id,
    name: b.name,
    normalized: b.normalized,
    parent_company: b.parentCompany,
    aliases: b.aliases,
    category: b.category,
    is_sample: true,
  }));
  const stub = {
    async query(text: string) {
      if (/^\s*SELECT \* FROM brands ORDER BY name\s*$/i.test(text)) return { rows };
      throw new Error(`fixture pool: unexpected query: ${text}`);
    },
  };
  (globalThis as unknown as { __pgPool?: unknown }).__pgPool = stub;
}
