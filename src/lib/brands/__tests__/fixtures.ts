import { getDb } from "@/lib/db";
import { normalizeBrandKey, upsertBrand } from "@/lib/repo/brands";
import { invalidateBrandIndex } from "../brand-index";
import type { CaseStatus } from "@/lib/types";

// Test fixture brands/cases. Mirrors the shapes the seeding agent produces but is
// self-contained so tests never depend on seeded data.

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

export function seedFixtures(): void {
  const db = getDb();
  for (const [name, parent, aliases, category] of BRANDS) {
    const normalized = normalizeBrandKey(name);
    upsertBrand({ name, normalized, parentCompany: parent, aliases, category });
  }
  const insertCase = db.prepare(
    `INSERT OR REPLACE INTO cases (id, source, source_id, case_name, court, status, date_filed, is_sample)
     VALUES ($id, 'sample', $id, $name, 'N.D. Cal.', $status, $date, 1)`,
  );
  const link = db.prepare(
    `INSERT OR REPLACE INTO case_brands (case_id, brand_id) VALUES ($caseId, $brandId)`,
  );
  for (const [id, brand, status, date] of CASES) {
    insertCase.run({ id, name: `Doe v. ${brand}`, status, date });
    link.run({ caseId: id, brandId: `brand_${brand}` });
  }
  // A case against both Dasani and its parent: must only be shown once.
  insertCase.run({ id: "c-shared", name: "Roe v. Dasani & Coca-Cola", status: "filed", date: "2025-11-01" });
  link.run({ caseId: "c-shared", brandId: "brand_dasani" });
  link.run({ caseId: "c-shared", brandId: "brand_the-coca-cola-company" });
  invalidateBrandIndex();
}
