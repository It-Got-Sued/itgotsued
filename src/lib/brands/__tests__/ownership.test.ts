import { finish, test, eq, ok } from "./harness";
import { buildBrandIndex } from "../brand-index";
import { matchDetections } from "../match";
import { normalizeBrandKey } from "@/lib/repo/brands";
import type { Brand, BrandDetection, CaseSummary } from "@/lib/types";

// Ownership chain walking, in memory: shapes mirror data/brands.json after seed-brands
// (brand rows plus one company row per parentCompany).

const brand = (name: string, parentCompany: string | null, aliases: string[] = []): Brand => ({
  id: `brand_${normalizeBrandKey(name)}`,
  name,
  normalized: normalizeBrandKey(name),
  parentCompany,
  aliases,
  category: null,
});

const BRANDS = [
  brand("Amazon.com, Inc.", null),
  brand("Amazon", "Amazon.com, Inc.", ["AMZN", "Amazon.com"]),
  brand("Ring", "Amazon.com, Inc.", ["Ring Doorbell"]),
  brand("Whole Foods Market", "Amazon.com, Inc.", ["Whole Foods"]),
  brand("Nestlé", null),
  brand("Nestlé Health Science", "Nestlé"),
  brand("Nature's Bounty", "Nestlé Health Science"),
  brand("Gerber", "Nestlé"),
  brand("The Coca-Cola Company", null),
  brand("Coca-Cola", "The Coca-Cola Company", ["Coke"]),
  brand("Dasani", "The Coca-Cola Company"),
  brand("Loop A", "Loop B"),
  brand("Loop B", "Loop A"),
];
const index = buildBrandIndex(BRANDS);

const CASES: Record<string, string[]> = {
  "amazon-com-inc": ["c-amazon-co"],
  amazon: ["c-amazon-prime"],
  ring: ["c-ring"],
  "whole-foods-market": ["c-wfm"],
  nestle: ["c-nestle"],
  "nestle-health-science": ["c-nhs"],
  "nature-s-bounty": ["c-bounty"],
  gerber: ["c-gerber"],
  "the-coca-cola-company": ["c-ko"],
  "coca-cola": ["c-coke"],
  dasani: ["c-dasani"],
  "loop-a": ["c-loop-a"],
  "loop-b": ["c-loop-b"],
};
const casesByBrand = (ids: string[]) => {
  const out = new Map<string, CaseSummary[]>();
  for (const id of ids) {
    const list = CASES[id.replace(/^brand_/, "")] ?? [];
    out.set(id, list.map((cid) => ({ id: cid, status: "filed" }) as CaseSummary));
  }
  return out;
};

const det = (text: string): BrandDetection => ({ brand: text, confidence: 1, source: "manual" });
const run = async (text: string) =>
  (await matchDetections([det(text)], { index, casesByBrand, caseEvidence: () => new Map() })).map((m) => `${m.brand.name}:${m.relation}`).sort();

console.log("ownership: climb to parents, walk down to subsidiaries");
void test("Ring doorbell cam climbs to Amazon.com, Inc. and namesake Amazon", async () => {
  const m = await run("i owned a ring door cam");
  eq(m, ["Amazon.com, Inc.:parent", "Amazon:parent", "Ring:direct"]);
});
void test("Ring does not surface sibling Whole Foods", async () => {
  ok(!(await run("Ring Doorbell")).some((n) => n.startsWith("Whole Foods")), "sibling surfaced");
});
void test("grandparent: Nature's Bounty -> Nestlé Health Science -> Nestlé", async () => {
  const m = await run("Nature's Bounty vitamins");
  eq(m, ["Nature's Bounty:direct", "Nestlé Health Science:parent", "Nestlé:parent"]);
});
void test("company walks down every level", async () => {
  const m = await run("Nestlé");
  eq(m, ["Gerber:subsidiary", "Nature's Bounty:subsidiary", "Nestlé Health Science:subsidiary", "Nestlé:direct"]);
});
void test("Amazon.com, Inc. walks down to Ring and Whole Foods", async () => {
  const m = await run("Amazon.com, Inc.");
  ok(m.includes("Ring:subsidiary") && m.includes("Whole Foods Market:subsidiary"), m.join(", "));
});
void test("namesake product line does not walk down to siblings (Coke -> no Dasani)", async () => {
  const m = await run("Coke");
  eq(m, ["Coca-Cola:direct", "The Coca-Cola Company:parent"]);
});
void test("parent_company cycles terminate", async () => {
  eq(await run("Loop A"), ["Loop A:direct", "Loop B:parent"]);
});

void finish();
