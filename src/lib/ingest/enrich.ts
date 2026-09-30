// AI enrichment of ingested cases: plain-language summary, who qualifies, defendant brands
// and products, categories, states and a status guess, via DeepSeek or the Vercel AI Gateway (./ai).
// The model reads the court filings: the complaint PDF when CourtListener has one, otherwise
// the other filings CourtListener has (settlement motions, orders), plus the docket entries.
// When the complaint is read, its full ComplaintAnalysis is saved too.
import { generateText, NoObjectGeneratedError, Output } from "ai";
import { z } from "zod";
import { stripCorporateSuffix } from "@/lib/brands/normalize";
import { normalizeBrandKey, upsertBrand } from "@/lib/repo/brands";
import { saveComplaintAnalysis } from "@/lib/repo/complaints";
import {
  deleteCase,
  findBrandByNameOrAlias,
  linkCaseBrand,
  listCasesForEnrichment,
  mergeDocketEntries,
  updateCaseFields,
  type EnrichmentCandidate,
} from "@/lib/repo/ingest";
import type { CaseStatus } from "@/lib/types";
import {
  analyzeComplaintText,
  ComplaintAnalysisSkipped,
  complaintModel,
  downloadPdf,
  extractPdfText,
  selectExcerpts,
  UnparseableComplaint,
} from "./complaint";
import { DEFAULT_MODEL, languageModel, missingCredentials } from "./ai";
import {
  CL_STORAGE,
  ClHttpError,
  CourtListenerClient,
  fromDocketEntriesApi,
  pickComplaintUrl,
  type ClRecapDocument,
} from "./courtlistener";

export const DEFAULT_ENRICH_MODEL = DEFAULT_MODEL;

export function enrichModel(): string {
  return process.env.ENRICH_MODEL?.trim() || DEFAULT_ENRICH_MODEL;
}

/** Longest summary shown on a case page. */
export const MAX_SUMMARY_WORDS = 200;
/** Characters of filing text sent to the model: the complaint, or other filings when it is missing. */
const COMPLAINT_CHARS = 100_000;
const OTHER_FILING_CHARS = 30_000;
const MAX_OTHER_FILINGS = 3;

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
      `Plain-language summary for consumers, at most ${MAX_SUMMARY_WORDS} words: who is suing whom, about what product or practice, what they want, and where the case stands (for example a proposed settlement). No legal jargon.`,
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

const SYSTEM_PROMPT = `You analyze U.S. federal court dockets for It Got Sued, a consumer site that tells people which class action lawsuits may involve products and services they use.

From the docket metadata, docket entries and any attached court filings (the complaint, or other filings such as settlement motions and orders), extract the requested fields. Write summaries for ordinary consumers at an 8th-grade reading level. Describe allegations as allegations ("says", "claims"), never as established facts. Do not give legal advice.

Only name brands and products that the filings actually identify. If the filings do not make something clear, return null, an empty list, or "unknown" rather than guessing. For status_guess: "filed" if the case is active without class certification, "certified" if a class was certified, "settlement_pending" if a settlement was proposed or preliminarily approved, "claims_closed" if a settlement's claim period ended, "dismissed" if dismissed or voluntarily dismissed, otherwise "unknown".`;

function describeCase(c: EnrichmentCandidate, filings: Filing[]): string {
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
    ...filings.map((f) => `\n<filing title="${f.title.replace(/"/g, "'")}">\n${f.text}\n</filing>`),
  ].join("\n");
}

export class EnrichmentSkipped extends Error {}

interface Filing {
  title: string;
  text: string;
}

/** Text of the complaint, when it can be read. Kept so the complaint analysis reuses it. */
interface ComplaintText {
  url: string;
  text: string;
  pageCount: number;
  textChars: number;
  truncated: boolean;
}

// ---------------------------------------------------------------------------------------
// CourtListener: fresh docket entries and the filings that have PDFs.

/** Docket fetches are rate limited (125/day), so one failure disables them for the run. */
let courtListener: CourtListenerClient | null | undefined;
let courtListenerOff = false;

function clClient(): CourtListenerClient | null {
  if (courtListener === undefined) {
    const token = process.env.COURTLISTENER_TOKEN;
    courtListener = token ? new CourtListenerClient({ token, maxRetries: 0 }) : null;
  }
  return courtListenerOff ? null : courtListener;
}

/**
 * Refresh a CourtListener case's docket entries and complaint URL, and return the RECAP
 * documents that have PDFs. Only used when no complaint URL is stored, to save the daily quota.
 */
async function refreshFromCourtListener(
  c: EnrichmentCandidate,
  log: (msg: string) => void,
): Promise<ClRecapDocument[]> {
  const client = clClient();
  const docketId = c.id.startsWith("cl-") ? Number(c.id.slice(3)) : NaN;
  if (!client || !Number.isInteger(docketId)) return [];
  try {
    const { entries, docs } = fromDocketEntriesApi((await client.docketEntries(docketId)).results ?? []);
    await mergeDocketEntries(c.id, entries);
    c.docketEntries = entries.slice(0, 60);
    const complaintUrl = pickComplaintUrl(docs);
    if (complaintUrl) {
      await updateCaseFields(c.id, { complaintUrl });
      c.complaintUrl = complaintUrl;
    }
    return docs.filter((d) => d.filepath_local);
  } catch (err) {
    if (err instanceof ClHttpError) {
      courtListenerOff = true;
      log(`  CourtListener docket fetch stopped for this run (HTTP ${err.status}).`);
      return [];
    }
    throw err;
  }
}

const SETTLEMENT_RE = /\b(settlement|approval|class certification|certify|notice to (the )?class|fairness)\b/i;

async function readPdf(url: string): Promise<{ text: string; pageCount: number } | null> {
  try {
    const pdf = await extractPdfText(await downloadPdf(url));
    return { text: pdf.text, pageCount: pdf.pageCount };
  } catch (err) {
    if (err instanceof UnparseableComplaint) return null;
    throw err;
  }
}

/** The complaint text if readable; otherwise up to MAX_OTHER_FILINGS other filings, settlement ones first. */
async function gatherFilings(
  c: EnrichmentCandidate,
  docs: ClRecapDocument[],
): Promise<{ filings: Filing[]; complaint: ComplaintText | null }> {
  if (c.complaintUrl) {
    const pdf = await readPdf(c.complaintUrl);
    if (pdf) {
      const { text, truncated } = selectExcerpts(pdf.text, COMPLAINT_CHARS);
      return {
        filings: [{ title: "Complaint", text }],
        complaint: { url: c.complaintUrl, text, pageCount: pdf.pageCount, textChars: pdf.text.length, truncated },
      };
    }
  }
  const others = docs
    .filter((d) => `${CL_STORAGE}/${d.filepath_local}` !== c.complaintUrl)
    .sort(
      (a, b) =>
        Number(SETTLEMENT_RE.test(b.description)) - Number(SETTLEMENT_RE.test(a.description)) ||
        (b.entry_number ?? 0) - (a.entry_number ?? 0),
    )
    .slice(0, MAX_OTHER_FILINGS);
  const filings: Filing[] = [];
  for (const d of others) {
    const pdf = await readPdf(`${CL_STORAGE}/${d.filepath_local}`);
    if (!pdf) continue;
    filings.push({
      title: `Docket entry ${d.entry_number ?? "?"}: ${d.description || "filing"}`,
      text: selectExcerpts(pdf.text, OTHER_FILING_CHARS).text,
    });
  }
  return { filings, complaint: null };
}

// ---------------------------------------------------------------------------------------
// Model

/** Cut to at most `max` words, ending on the last full sentence that fits when there is one. */
export function capWords(text: string, max = MAX_SUMMARY_WORDS): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= max) return text.trim();
  const cut = words.slice(0, max).join(" ");
  const end = cut.lastIndexOf(". ");
  return end > cut.length / 2 ? cut.slice(0, end + 1) : `${cut}…`;
}

export async function extractEnrichment(
  c: EnrichmentCandidate,
  filings: Filing[],
  opts: { model?: string } = {},
): Promise<Enrichment> {
  try {
    const result = await generateText({
      model: languageModel(opts.model ?? enrichModel()),
      system: SYSTEM_PROMPT,
      prompt: describeCase(c, filings),
      output: Output.object({ schema: EnrichmentSchema }),
      maxOutputTokens: 8_000,
      maxRetries: 2,
      abortSignal: AbortSignal.timeout(180_000),
    });
    return result.output;
  } catch (err) {
    if (NoObjectGeneratedError.isInstance(err)) {
      throw new EnrichmentSkipped(`model returned no valid JSON (${err.finishReason ?? "unknown"})`);
    }
    throw err;
  }
}

const US_STATES = new Set(
  (
    "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ " +
    "NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR GU VI AS MP"
  ).split(" "),
);

/** Persist an enrichment: case fields, then brand links (reusing dictionary brands by name/alias). */
export async function applyEnrichment(c: EnrichmentCandidate, e: Enrichment): Promise<string[]> {
  const states = [
    ...new Set(e.states.map((s) => s.trim().toUpperCase()).filter((s) => US_STATES.has(s))),
  ];
  const canUpdateStatus = c.status === "filed" || c.status === "unknown";
  await updateCaseFields(c.id, {
    summary: capWords(e.summary) || null,
    whoQualifies: e.who_qualifies?.trim() || null,
    categories: e.categories.map((s) => s.trim().toLowerCase()).filter(Boolean).slice(0, 6),
    states,
    settlementAmount: e.settlement_amount?.trim() || null,
    ...(canUpdateStatus ? { status: e.status_guess as CaseStatus } : {}),
    lastChecked: new Date().toISOString(),
    enrichedAt: new Date().toISOString(),
  });

  const linked: string[] = [];
  for (const d of e.defendants) {
    // Link the defendant company too, so owners of any of its brands (Ring for a suit
    // against Amazon.com, Inc.) find the case by climbing to the parent.
    const company = d.company.trim();
    const companyNormalized = normalizeBrandKey(company);
    if (companyNormalized) {
      const stripped = stripCorporateSuffix(company);
      const entity =
        (await findBrandByNameOrAlias(company, companyNormalized)) ??
        (await findBrandByNameOrAlias(stripped, normalizeBrandKey(stripped))) ??
        (await upsertBrand({
          name: company,
          normalized: companyNormalized,
          parentCompany: null,
          aliases: [],
          category: "company",
        }));
      await linkCaseBrand(c.id, entity.id, "defendant", []);
      linked.push(entity.name);
    }
    for (const b of d.brands) {
      const name = b.name.trim();
      const normalized = normalizeBrandKey(name);
      if (!normalized) continue;
      const brand =
        (await findBrandByNameOrAlias(name, normalized)) ??
        (await upsertBrand({
          name,
          normalized,
          parentCompany: d.company.trim() || null,
          aliases: [],
          category: e.categories[0] ?? null,
        }));
      await linkCaseBrand(c.id, brand.id, "defendant", b.products);
      linked.push(brand.name);
    }
  }
  return linked;
}

export interface EnrichOptions {
  limit: number;
  force?: boolean;
  ids?: string[];
  /** Read court filings (complaint or other PDFs). Off means docket entries only. */
  includePdf?: boolean;
  /** Delete cases the model says are not class actions. */
  prune?: boolean;
  model?: string;
  log?: (msg: string) => void;
}

function isAuthError(err: unknown): boolean {
  const e = (err as { lastError?: unknown })?.lastError ?? err;
  const status = (e as { statusCode?: number })?.statusCode;
  return status === 401 || status === 403;
}

export async function enrichPending(opts: EnrichOptions) {
  const log = opts.log ?? console.log;
  const stats = { enriched: 0, analyzed: 0, skipped: 0, failed: 0, pruned: 0 };
  const model = opts.model ?? enrichModel();
  const missing = missingCredentials(model) ?? missingCredentials(complaintModel());
  if (missing) {
    log(`${missing}; skipping enrichment.`);
    return stats;
  }
  const candidates = await listCasesForEnrichment({ limit: opts.limit, force: opts.force, ids: opts.ids });
  log(`Enriching ${candidates.length} case(s) with ${model}`);

  for (const c of candidates) {
    try {
      let filings: Filing[] = [];
      let complaint: ComplaintText | null = null;
      if (opts.includePdf ?? true) {
        const docs = c.complaintUrl ? [] : await refreshFromCourtListener(c, log);
        ({ filings, complaint } = await gatherFilings(c, docs));
      }
      const e = await extractEnrichment(c, filings, { model });
      if (!e.is_class_action && opts.prune) {
        await deleteCase(c.id);
        stats.pruned++;
        log(`  ${c.id} pruned (not a class action): ${c.caseName}`);
        continue;
      }
      const brands = await applyEnrichment(c, e);
      stats.enriched++;
      const read = complaint ? "complaint" : filings.length ? `${filings.length} filing(s)` : "docket only";
      log(
        `  ${c.id} ${e.is_class_action ? "" : "[not class action?] "}${e.status_guess} | read: ${read} | brands: ${brands.join(", ") || "-"} | ${c.caseName}`,
      );
      if (complaint) {
        try {
          const analysis = await analyzeComplaintText(
            { ...c, complaintUrl: complaint.url },
            complaint.text,
            { model: complaintModel() },
          );
          await saveComplaintAnalysis({
            caseId: c.id,
            complaintUrl: complaint.url,
            status: "parsed",
            pageCount: complaint.pageCount,
            textChars: complaint.textChars,
            truncated: complaint.truncated,
            model: complaintModel(),
            analysis,
          });
          stats.analyzed++;
        } catch (err) {
          if (!(err instanceof ComplaintAnalysisSkipped)) throw err;
          log(`  ${c.id} complaint analysis skipped: ${err.message}`);
        }
      }
    } catch (err) {
      if (err instanceof EnrichmentSkipped) {
        stats.skipped++;
        log(`  ${c.id} skipped: ${err.message}`);
      } else if (isAuthError(err)) {
        stats.failed++;
        log(`AI provider rejected the request (authentication or model access); stopping. ${err instanceof Error ? err.message : ""}`);
        break;
      } else {
        // Transient (network, rate limit, gateway error): leave unenriched so the next run retries.
        stats.failed++;
        log(`  ${c.id} failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  return stats;
}
