// Parent-company lawsuits apply to an owned brand only when their filings name it.
import { mentionedBrand, matchDetections, type RankedBrandMatch } from "../match";
import type { BrandDetection } from "@/lib/types";
import { inferStatusFromDocket } from "@/lib/ingest/status-from-docket";
import { fixtureIndex, fixtureOptions } from "./fixtures";
import { eq, finish, ok, test } from "./harness";

const own = (brand: string): BrandDetection => ({ brand, confidence: 1, source: "manual" });
const byName = (ms: RankedBrandMatch[], name: string) => ms.find((m) => m.brand.name === name);
const brand = (name: string) => fixtureIndex.brands.find((b) => b.name === name)!;

test("parent lawsuit naming the brand applies (Crest -> P&G case about Crest)", async () => {
  const ms = await matchDetections([own("Crest")], fixtureOptions());
  const pg = byName(ms, "Procter & Gamble");
  ok(pg, "P&G parent match expected");
  eq(pg!.relation, "parent");
  eq(pg!.cases.map((c) => c.id), ["c-pg"]);
  eq(pg!.mentions?.["c-pg"], "Crest");
});

test("parent lawsuit NOT naming the brand is hidden and counted (Tide -> P&G case about Crest)", async () => {
  const ms = await matchDetections([own("Tide")], fixtureOptions());
  const pg = byName(ms, "Procter & Gamble");
  ok(pg, "P&G entry expected, carrying the hidden count");
  eq(pg!.cases.length, 0);
  eq(pg!.unverifiedCount, 1);
});

test("parent with no mention and no other cases: brand gets nothing applicable (Dove -> Unilever)", async () => {
  const ms = await matchDetections([own("Dove")], fixtureOptions());
  eq(ms.flatMap((m) => m.cases).length, 0);
  eq(byName(ms, "Unilever")?.unverifiedCount, 1);
});

test("owning the parent company itself shows all its cases (no applicability filter)", async () => {
  const ms = await matchDetections([own("Procter & Gamble")], fixtureOptions());
  const pg = byName(ms, "Procter & Gamble");
  eq(pg!.relation, "direct");
  eq(pg!.cases.map((c) => c.id), ["c-pg"]);
  eq(pg!.unverifiedCount, undefined);
});

test("company downward: P&G owner also sees subsidiary Crest's own case", async () => {
  const ms = await matchDetections([own("Procter & Gamble")], fixtureOptions());
  ok(byName(ms, "Crest")?.cases.some((c) => c.id === "c-crest"), "Crest case via subsidiary");
});

test("mentionedBrand: whole words, aliases, corporate suffixes", () => {
  eq(mentionedBrand("COMPLAINT against PepsiCo, Inc., The Gatorade Company", [{ ...brand("Tide"), name: "Gatorade" }]), "Gatorade");
  eq(mentionedBrand("Doe v. Doverton Farms", [brand("Dove")]), null);
  eq(mentionedBrand("claims about Crest Pro-Health rinse", [{ ...brand("Crest"), name: "Oral-B" }]), "Oral-B");
  eq(mentionedBrand("no brand here", [brand("Crest")]), null);
});

test("status from filings: preliminary approval -> settlement_pending", () => {
  const r = inferStatusFromDocket(
    [{ entryNumber: 98, dateFiled: null, description: "STIPULATION to Extend Settlement Notice Date, Claims Deadline", documentUrl: null }],
    "filed",
  );
  eq(r?.status, "settlement_pending");
});

test("status from filings: class certification granted -> certified; never moves backward", () => {
  const entries = [{ entryNumber: 40, dateFiled: null, description: "ORDER granting motion for class certification", documentUrl: null }];
  eq(inferStatusFromDocket(entries, "filed")?.status, "certified");
  eq(inferStatusFromDocket(entries, "settlement_pending"), null);
});

test("status from filings: voluntary dismissal -> dismissed only from filed/unknown", () => {
  const entries = [{ entryNumber: 5, dateFiled: null, description: "NOTICE of Voluntary Dismissal by Alex K.", documentUrl: null }];
  eq(inferStatusFromDocket(entries, "filed")?.status, "dismissed");
  eq(inferStatusFromDocket(entries, "certified"), null);
});

void finish();
