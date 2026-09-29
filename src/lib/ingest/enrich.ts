// AI enrichment of ingested cases: plain-language summary, who qualifies, defendant brands
// and products, categories, states and a status guess, via Claude structured output.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { normalizeBrandKey, upsertBrand } from "@/lib/repo/brands";
import {
  deleteCase,
  findBrandByNameOrAlias,
  linkCaseBrand,
  listCasesForEnrichment,
  updateCaseFields,
  type EnrichmentCandidate,
} from "@/lib/repo/ingest";
import type { CaseStatus } from "@/lib/types";

export const ENRICH_MODEL = "claude-opus-5-5";

// claims_open is deliberately excluded: we only mark a case claims_open when we have the
// official claim URL, which filings alone do not give us.
const STATUS_GUESSES = [
  "filed",
  "certified",
  "settlement_pending",
  "claims_closed",
  "dismissed",
  "unknown",
] as const;

export const EnrichmentSchema = z.object({
  is_class_action: z
    .boolean()
    .describe("True if the plaintiffs sue on behalf of a class (Rule 23 or state equivalent)."),
  summary: z
    .string()
    .describe(
      "2-4 plain-language sentences for consumers: who is suing whom, about what product or practice, and what they want. No legal jargon.",
    ),
  who_qualifies: z
    .string()
    .nullable()
    .describe("The proposed or certified class definition in plain language, or null if unknown."),
  defendants: z.array(
    z.object({
      company: z.string().describe("Defendant legal name as filed, e.g. 'The Coca-Cola Company'."),
      brands: z
        .array(
          z.object({
            name: z
              .string()
              .describe(
                "Consumer-facing brand name as shoppers know it, e.g. 'Dasani' or 'Coca-Cola'. Use the company's common name if it sells under its own name.",
              ),
            products: z.array(z.string()).describe("Specific products at issue, e.g. 'Dasani 16.9 oz bottled water'."),
          }),
        )
        .describe("Consumer brands at issue. Empty if the defendant has no consumer-facing brand."),
    }),
  ),
  categories: z
    .array(z.string())
    .describe("1-4 lowercase snake_case topics, e.g. food_labeling, data_breach, hidden_fees, tcpa, product_defect."),
  states: z
    .array(z.string())
    .describe("Two-letter state codes the class is limited to; empty if nationwide or unclear."),
  status_guess: z.enum(STATUS_GUESSES),
  settlement_amount: z.string().nullable().describe("Settlement amount if one is stated, else null."),
});

export type Enrichment = z.infer<typeof EnrichmentSchema>;

const SYSTEM_PROMPT = `You analyze U.S. federal court dockets for ClassActionForMe, a consumer site that tells people which class action lawsuits may involve products and services they use.

From the docket metadata, docket entries and (when attached) the complaint, extract the requested fields. Write summaries for ordinary consumers at an 8th-grade reading level. Describe allegations as allegations ("says", "claims"), never as established facts. Do not give legal advice.

Only name brands and products that the filings actually identify. If the filings do not make something clear, return null, an empty list, or "unknown" rather than guessing. For status_guess: "filed" if the case is active without class certification, "certified" if a class was certified, "settlement_pending" if a settlement was proposed or preliminarily approved, "claims_closed" if a settlement's claim period ended, "dismissed" if dismissed or voluntarily dismissed, otherwise "unknown".`;

function describeCase(c: EnrichmentCandidate): string {
  const entries = c.docketEntries
    .map((e) => `#${e.entryNumber ?? "?"} (${e.dateFiled ?? "n.d."}): ${e.description}`)
    .join("\n");
  return [
    `Case name: ${c.caseName}`,
    `Court: ${c.court}`,
    `Docket number: ${c.docketNumber ?? "unknown"}`,
    `Date filed: ${c.dateFiled ?? "unknown"}`,
    `Nature of suit: ${c.natureOfSuit ?? "unknown"}`,
    `Source: ${c.sourceUrl ?? "n/a"}`,
    "",
    "Docket entries available to us (may be partial):",
    entries || "(none)",
  ].join("\n");
}

export class EnrichmentSkipped extends Error {}

export async function extractEnrichment(
  client: Anthropic,
  c: EnrichmentCandidate,
  opts: { includePdf: boolean },
): Promise<Enrichment> {
  const run = async (withPdf: boolean) => {
    const content: Anthropic.Beta.BetaContentBlockParam[] = [];
    if (withPdf && c.complaintUrl) {
      content.push({
        type: "document",
        source: { type: "url", url: c.complaintUrl },
        title: "Complaint",
      });
    }
    content.push({ type: "text", text: describeCase(c) });
    return client.beta.messages.parse({
      model: ENRICH_MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(EnrichmentSchema) },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
    });
  };

  const usePdf = opts.includePdf && Boolean(c.complaintUrl);
  let response;
  try {
    response = await run(usePdf);
  } catch (err) {
    // The complaint URL may be unreachable or too large; retry from docket text alone.
    if (usePdf && err instanceof Anthropic.BadRequestError) response = await run(false);
    else throw err;
  }

  if (response.stop_reason === "refusal") {
    throw new EnrichmentSkipped(`model declined (${response.stop_details?.category ?? "no category"})`);
  }
  if (response.stop_reason === "max_tokens" || !response.parsed_output) {
    throw new EnrichmentSkipped(`no structured output (stop_reason=${response.stop_reason})`);
  }
  return response.parsed_output;
}

const US_STATES = new Set(
  (
    "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ " +
    "NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR GU VI AS MP"
  ).split(" "),
);

/** Persist an enrichment: case fields, then brand links (reusing dictionary brands by name/alias). */
export function applyEnrichment(c: EnrichmentCandidate, e: Enrichment): string[] {
  const states = [
    ...new Set(e.states.map((s) => s.trim().toUpperCase()).filter((s) => US_STATES.has(s))),
  ];
  const canUpdateStatus = c.status === "filed" || c.status === "unknown";
  updateCaseFields(c.id, {
    summary: e.summary.trim() || null,
    whoQualifies: e.who_qualifies?.trim() || null,
    categories: e.categories.map((s) => s.trim().toLowerCase()).filter(Boolean).slice(0, 6),
    states,
    settlementAmount: e.settlement_amount?.trim() || null,
    ...(canUpdateStatus ? { status: e.status_guess as CaseStatus } : {}),
    lastChecked: new Date().toISOString(),
  });

  const linked: string[] = [];
  for (const d of e.defendants) {
    for (const b of d.brands) {
      const name = b.name.trim();
      const normalized = normalizeBrandKey(name);
      if (!normalized) continue;
      const brand =
        findBrandByNameOrAlias(name, normalized) ??
        upsertBrand({
          name,
          normalized,
          parentCompany: d.company.trim() || null,
          aliases: [],
          category: e.categories[0] ?? null,
        });
      linkCaseBrand(c.id, brand.id, "defendant", b.products);
      linked.push(brand.name);
    }
  }
  return linked;
}

export function hasAnthropicCredentials(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export interface EnrichOptions {
  limit: number;
  force?: boolean;
  ids?: string[];
  includePdf?: boolean;
  /** Delete cases the model says are not class actions. */
  prune?: boolean;
  log?: (msg: string) => void;
}

export async function enrichPending(opts: EnrichOptions) {
  const log = opts.log ?? console.log;
  const stats = { enriched: 0, skipped: 0, failed: 0, pruned: 0 };
  if (!hasAnthropicCredentials()) {
    log("ANTHROPIC_API_KEY is not set; skipping enrichment.");
    return stats;
  }
  const client = new Anthropic();
  const candidates = listCasesForEnrichment({ limit: opts.limit, force: opts.force, ids: opts.ids });
  log(`Enriching ${candidates.length} case(s) with ${ENRICH_MODEL}`);

  for (const c of candidates) {
    try {
      const e = await extractEnrichment(client, c, { includePdf: opts.includePdf ?? true });
      if (!e.is_class_action && opts.prune) {
        deleteCase(c.id);
        stats.pruned++;
        log(`  ${c.id} pruned (not a class action): ${c.caseName}`);
        continue;
      }
      const brands = applyEnrichment(c, e);
      stats.enriched++;
      log(
        `  ${c.id} ${e.is_class_action ? "" : "[not class action?] "}${e.status_guess} | brands: ${brands.join(", ") || "-"} | ${c.caseName}`,
      );
    } catch (err) {
      if (err instanceof EnrichmentSkipped) {
        stats.skipped++;
        log(`  ${c.id} skipped: ${err.message}`);
      } else if (err instanceof Anthropic.AuthenticationError) {
        log("Anthropic authentication failed; stopping.");
        stats.failed++;
        break;
      } else if (err instanceof Anthropic.APIError) {
        stats.failed++;
        log(`  ${c.id} API error ${err.status}: ${err.message}`);
      } else {
        throw err;
      }
    }
  }
  return stats;
}
