import { finish, test, eq, ok } from "./harness";
import { fixtureIndex, fixtureOptions } from "./fixtures";
import { type MatchOptions, matchDetections, resolveBrandString } from "../match";
import type { BrandDetection } from "@/lib/types";

const match = (d: BrandDetection[], o: MatchOptions = {}) => matchDetections(d, fixtureOptions(o));
const det = (brand: string, source: BrandDetection["source"] = "text", confidence = 0.9, product?: string): BrandDetection => ({
  brand, product, confidence, source,
});
const resolved = (s: string, source: BrandDetection["source"] = "text") => resolveBrandString(s, source, fixtureIndex)?.brand.name ?? null;

console.log("resolution: exact / alias / compact / token");
void test("exact name", () => eq(resolved("Nature Made"), "Nature Made"));
void test("alias Coke -> Coca-Cola", () => eq(resolved("Coke"), "Coca-Cola"));
void test("alias P&G -> Procter & Gamble", () => eq(resolved("P&G"), "Procter & Gamble"));
void test("compact CocaCola", () => eq(resolved("CocaCola"), "Coca-Cola"));
void test("suffix stripped: Peloton Interactive, Inc.", () => eq(resolved("Peloton Interactive, Inc."), "Peloton"));
void test("text label with generic word: Crest toothpaste", () => eq(resolved("Crest toothpaste"), "Crest"));
void test("photo product label: Nature Made vitamins", () => eq(resolved("Nature Made vitamins", "photo"), "Nature Made"));
void test("text: non-generic remainder is not a match (Dasani Street Diner)", () => eq(resolved("Dasani Street Diner"), null));

console.log("bank merchant strings");
void test("AMZN Mktp US*2K4 -> Amazon", () => eq(resolved("AMZN Mktp US*2K4", "bank"), "Amazon"));
void test("SQ *BLUE BOTTLE -> Blue Bottle Coffee", () => eq(resolved("SQ *BLUE BOTTLE", "bank"), "Blue Bottle Coffee"));
void test("PAYPAL *NETFLIX -> Netflix", () => eq(resolved("PAYPAL *NETFLIX", "bank"), "Netflix"));
void test("city suffix: NETFLIX.COM LOS GATOS CA", () => eq(resolved("NETFLIX.COM LOS GATOS CA", "bank"), "Netflix"));
void test("unknown merchant stays unmatched", () => eq(resolved("SQ *JOES TACO TRUCK", "bank"), null));

console.log("fuzzy: conservative");
void test('"Dove" must not match "Dover Saddlery"', () => eq(resolved("Dove"), "Dove"));
void test('"Dover" must not match "Dove"', () => eq(resolved("Dover"), null));
void test('"Doves" must not match "Dove"', () => eq(resolved("Doves"), null));
void test('"Tides" must not match "Tide"', () => eq(resolved("Tides"), null));
void test('"Crust" must not match "Crest" (too short for fuzzy)', () => eq(resolved("Crust"), null));
void test('"Netflx" matches Netflix (1 edit)', () => eq(resolved("Netflx"), "Netflix"));
void test('"Pelotn" matches Peloton', () => eq(resolved("Pelotn"), "Peloton"));
void test('"Nature Maid" matches Nature Made (2 edits, long)', () => eq(resolved("Nature Maid"), "Nature Made"));
void test('"Netfix Bank" does not fuzzy-match', () => eq(resolved("Netfix Bank"), null));
void test('"Samsara" does not match Samsung', () => eq(resolved("Samsara"), null));
void test('"Amazonia" does not match Amazon', () => eq(resolved("Amazonia"), null));

console.log("matchDetections: parent company + merging + ranking");
void test("Dasani detection surfaces The Coca-Cola Company case (relation parent)", async () => {
  const m = await match([det("Dasani")]);
  const parent = m.find((x) => x.brand.name === "The Coca-Cola Company");
  ok(parent, "parent match missing");
  eq(parent!.relation, "parent");
  eq(parent!.via, ["Dasani"]);
  eq(parent!.cases.map((c) => c.id), ["c-ko-parent"], "shared case must stay under Dasani");
  const dasani = m.find((x) => x.brand.name === "Dasani")!;
  eq(dasani.relation, "direct");
  eq(dasani.cases.map((c) => c.id).sort(), ["c-dasani", "c-shared"]);
  eq(m[0].brand.name, "The Coca-Cola Company", "claims_open first");
});
void test("Coke does not surface sibling Dasani, does surface parent", async () => {
  const names = (await match([det("Coke")])).map((x) => `${x.brand.name}:${x.relation}`);
  ok(!names.some((n) => n.startsWith("Dasani")), `unexpected sibling: ${names}`);
  ok(names.includes("The Coca-Cola Company:parent"), `missing parent: ${names}`);
  ok(names.includes("Coca-Cola:direct"), `missing direct: ${names}`);
});
void test("company detection expands down to subsidiaries", async () => {
  const m = await match([det("The Coca-Cola Company", "bank", 0.9)]);
  const sub = m.find((x) => x.brand.name === "Dasani");
  ok(sub, "subsidiary missing");
  eq(sub!.relation, "subsidiary");
});
void test("Crest (parent 'Procter & Gamble Co.') maps to Procter & Gamble", async () => {
  const m = await match([det("Crest")]);
  eq(m.find((x) => x.brand.name === "Procter & Gamble")?.relation, "parent");
});
void test("duplicates merge per brand with noisy-OR confidence", async () => {
  const m = await match([det("Coke", "photo", 0.6), det("Coca-Cola", "text", 0.6)]);
  const coke = m.find((x) => x.brand.name === "Coca-Cola")!;
  eq(coke.detections.length, 2);
  ok(coke.confidence > 0.8, `confidence ${coke.confidence}`);
});
void test("low-confidence detections dropped", async () => {
  eq((await match([det("Netflix", "photo", 0.3)])).length, 0);
});
void test("brands with zero cases are excluded (Dove)", async () => {
  const m = await match([det("Dove")]);
  ok(!m.some((x) => x.brand.name === "Dove"), "Dove has no cases");
  eq(m.map((x) => x.brand.name), ["Unilever"]);
});
void test("sort: claims_open first, then case count", async () => {
  const m = await match([det("Peloton"), det("Amazon"), det("Nature Made")]);
  eq(m.map((x) => x.brand.name), ["Amazon", "Nature Made", "Peloton"]);
  eq(m[0].brand.name, "Amazon");
  eq(m[0].cases[0].status, "claims_open");
});
void test("activeOnly drops dismissed/closed cases", async () => {
  eq((await match([det("Netflix")])).length, 1);
  eq((await match([det("Netflix")], { activeOnly: true })).length, 0);
  eq((await match([det("Crest")], { activeOnly: true })).map((x) => x.brand.name), ["Procter & Gamble"]);
});
void test("product used when brand is unknown", async () => {
  eq((await match([det("Unknown Co", "photo", 0.9, "Dasani water bottle")])).some((x) => x.brand.name === "Dasani"), true);
});

void finish();
