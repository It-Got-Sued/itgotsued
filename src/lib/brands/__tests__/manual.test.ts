import { finish, test, eq, ok } from "./harness";
import { seedFixtures } from "./fixtures";
import { matchDetections, resolveBrandString, MAX_DETECTIONS } from "../match";
import type { BrandDetection } from "@/lib/types";

seedFixtures();
const manual = (label: string): BrandDetection => ({ brand: label, confidence: 1, source: "manual" });
const resolved = (label: string) => resolveBrandString(label, "manual")?.brand.name ?? null;

console.log("manual My Items resolution");
void test('"Crest toothpaste" -> Crest', () => eq(resolved("Crest toothpaste"), "Crest"));
void test('"my peloton bike" -> Peloton', () => eq(resolved("my peloton bike"), "Peloton"));
void test('"coke" -> Coca-Cola', () => eq(resolved("coke"), "Coca-Cola"));
void test('"Diet Coke 12 pack" -> Coca-Cola', () => eq(resolved("Diet Coke 12 pack"), "Coca-Cola"));
void test('"Zero Sugar Coke" -> Coca-Cola (brand not first)', () => eq(resolved("Zero Sugar Coke"), "Coca-Cola"));
void test('"Samsung Galaxy S23 phone" -> Samsung', () => eq(resolved("Samsung Galaxy S23 phone"), "Samsung"));
void test('"Honey Nut Cheerios" -> Cheerios', () => eq(resolved("Honey Nut Cheerios"), "Cheerios"));
void test('"Pelotn tread" -> Peloton (typo, fuzzy on core)', () => eq(resolved("Pelotn"), "Peloton"));
void test('"toothpaste" alone -> no brand', () => eq(resolved("toothpaste"), null));
void test('"Dover sole fillets" -> not Dove', () => ok(resolved("Dover sole fillets") !== "Dove", "matched Dove"));

void test("manual items are never dropped on confidence", () => {
  const m = matchDetections([{ ...manual("my peloton bike"), confidence: 0.1 }]);
  eq(m.map((x) => x.brand.name), ["Peloton"]);
  ok(m[0].confidence >= 0.99, "manual confidence should read as user-confirmed");
});
void test("manual + activeOnly", () => {
  const m = matchDetections([manual("Netflix"), manual("Crest toothpaste")], { activeOnly: true });
  eq(m.map((x) => x.brand.name), ["Procter & Gamble"]);
});
void test(`list capped at ${MAX_DETECTIONS}`, () => {
  const items = Array.from({ length: MAX_DETECTIONS }, () => manual("unbranded thing")).concat(manual("Amazon"));
  eq(matchDetections(items).length, 0, "item 201 must be ignored");
});

setTimeout(finish, 0);
