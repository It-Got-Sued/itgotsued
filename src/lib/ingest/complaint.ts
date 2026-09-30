// Complaint parser + AI summarizer: download a case's complaint PDF, extract its text,
// and have an LLM (DeepSeek or the Vercel AI Gateway, see ./ai) return a validated ComplaintAnalysis:
// plain-English summary, allegations, class definition and an estimated payout range.
import { generateText, NoObjectGeneratedError, Output } from "ai";
import { extractText, getDocumentProxy } from "unpdf";
import { z } from "zod";
import {
  listComplaintsToParse,
  saveComplaintAnalysis,
  type ComplaintCandidate,
} from "@/lib/repo/complaints";
import type { ComplaintAnalysis } from "@/lib/types";
import { DEFAULT_MODEL, languageModel, missingCredentials } from "./ai";

export const DEFAULT_COMPLAINT_MODEL = DEFAULT_MODEL;

export function complaintModel(): string {
  return process.env.COMPLAINT_SUMMARY_MODEL?.trim() || DEFAULT_COMPLAINT_MODEL;
}

/** Characters of complaint text sent to the model (~4 chars per token). */
const MAX_PROMPT_CHARS = 120_000;
const MAX_PDF_BYTES = 50 * 1024 * 1024;
/** Below this many extracted characters per page the PDF is treated as scanned. */
const MIN_CHARS_PER_PAGE = 150;

export const PAYOUT_DISCLAIMER =
  "This is an estimate based on the complaint and comparable cases, not a guarantee. " +
  "Most cases settle for less than what is sought, many are dismissed, and actual payments " +
  "depend on the settlement terms and how many people file claims.";

const nullableString = (description: string) => z.string().nullable().describe(description);

export const ComplaintAnalysisSchema = z.object({
  is_complaint: z
    .boolean()
    .describe("True if this document is a complaint (original or amended). False for orders, motions, etc."),
  summary: z
    .string()
    .describe(
      "3-5 plain-English sentences for consumers at an 8th-grade reading level: who is suing whom, about what, and what they want. Describe allegations as claims, not facts.",
    ),
  allegations: z.object({
    overview: z.string().describe("One or two sentences on what the defendant allegedly did wrong."),
    defendant_conduct: z.array(z.string()).describe("Specific practices the complaint says the defendant engaged in."),
    products_or_services: z
      .array(z.string())
      .describe("Products, services, apps or accounts involved, as named in the complaint (brand + product)."),
    legal_claims: z
      .array(z.string())
      .describe("Causes of action / counts in plain words, e.g. 'Violation of California's Unfair Competition Law'."),
  }),
  class_definition: z.object({
    verbatim: nullableString("The proposed class definition quoted from the complaint, or null if none."),
    plain_language: nullableString("Who is in the class, in one or two plain sentences, or null."),
    eligibility_criteria: z
      .array(z.string())
      .describe("Checklist a reader can use to see if they qualify, e.g. 'Bought X in the U.S.'."),
    class_period: nullableString("Date range of the class, e.g. 'June 1, 2020 to present', or null."),
    geography: nullableString("Where class members must live or have bought, e.g. 'Nationwide', 'Illinois'."),
    subclasses: z
      .array(z.object({ name: z.string(), definition: z.string() }))
      .describe("State or other subclasses, if any."),
  }),
  estimated_payout: z.object({
    low_usd: z
      .number()
      .nullable()
      .describe("Low end of a realistic per-class-member payment in USD if the case succeeds or settles; null if no basis."),
    high_usd: z
      .number()
      .nullable()
      .describe("High end of a realistic per-class-member payment in USD; null if no basis."),
    basis: z
      .string()
      .describe(
        "2-4 sentences explaining the range: damages sought, statutory damages per claimant, and typical settlements in comparable cases.",
      ),
    damages_sought: nullableString("Damages the complaint asks for (amounts, multipliers, aggregate figures), or null."),
    statutory_damages: nullableString(
      "Statutory damages per person under the statutes cited (e.g. TCPA $500-$1,500 per call), or null if none apply.",
    ),
    comparable_settlements: nullableString(
      "Typical per-claimant payouts in similar settled cases, described generally; do not invent specific case names.",
    ),
    confidence: z.enum(["low", "medium", "high"]),
    disclaimer: z.string().describe("A short note that this is an estimate, not a guarantee."),
  }),
  defendants: z.array(z.string()).describe("Defendant names as filed."),
  plaintiffs: z.array(z.string()).describe("Named plaintiffs."),
  court: nullableString("Court named in the caption, or null."),
  relief_sought: z.array(z.string()).describe("What the plaintiffs ask the court for, from the prayer for relief."),
  key_dates: z
    .array(z.object({ date: z.string().nullable(), event: z.string() }))
    .describe("Important dates in the complaint (filing, purchase periods, breach dates), ISO YYYY-MM-DD when exact."),
});

// Keep the zod schema and the shared ComplaintAnalysis type in lockstep.
type SchemaMatchesType = z.infer<typeof ComplaintAnalysisSchema> extends ComplaintAnalysis
  ? ComplaintAnalysis extends z.infer<typeof ComplaintAnalysisSchema>
    ? true
    : never
  : never;
const _schemaMatchesType: SchemaMatchesType = true;
void _schemaMatchesType;

const SYSTEM_PROMPT = `You read U.S. class action complaints for It Got Sued, a consumer site that helps people find lawsuits about products and services they use and understand what they might be owed.

Extract the requested fields from the complaint text. Write for ordinary consumers at an 8th-grade reading level. Describe allegations as allegations ("the complaint says", "claims"), never as established facts. Do not give legal advice. Only state what the complaint supports; use null or empty lists rather than guessing. The text may be excerpts of a long complaint, marked "[... omitted ...]".

For estimated_payout, estimate a realistic range per class member (not the aggregate), assuming the case settles or succeeds:
- Start from what the complaint seeks: actual damages, refunds, price premiums, and aggregate figures divided by class size when both are stated.
- Apply statutory damages per claimant when a cited statute provides them (e.g. TCPA $500-$1,500 per call or text; BIPA $1,000 negligent / $5,000 reckless per violation; FCRA $100-$1,000 willful; VPPA $2,500; FDCPA up to $1,000 for named plaintiffs with class recovery capped), remembering settlements usually pay a fraction of statutory amounts.
- Calibrate against typical settlements for this case type (e.g. consumer false-advertising settlements often pay a few dollars to tens of dollars per claimant or a partial refund; data breach settlements often pay tens to a few hundred dollars, more with documented losses; TCPA settlements often pay tens to a few hundred dollars per claimant after claims-rate effects).
- If there is no reasonable basis (e.g. injunctive-relief-only case, individual securities or employment claims with no per-person figures), return null amounts and explain why.
Use "low" confidence unless the complaint gives concrete per-person numbers.`;

// ---------------------------------------------------------------------------------------
// PDF

export class UnparseableComplaint extends Error {
  constructor(
    message: string,
    readonly pageCount: number | null = null,
    readonly textChars: number | null = null,
  ) {
    super(message);
  }
}

export async function downloadPdf(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000), redirect: "follow" });
  if (res.status === 404 || res.status === 410 || res.status === 403) {
    throw new UnparseableComplaint(`complaint PDF unavailable (HTTP ${res.status})`);
  }
  if (!res.ok) throw new Error(`complaint download failed (HTTP ${res.status})`);
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_PDF_BYTES) throw new UnparseableComplaint(`complaint PDF too large (${declared} bytes)`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > MAX_PDF_BYTES) {
    throw new UnparseableComplaint(`complaint PDF too large (${bytes.byteLength} bytes)`);
  }
  return bytes;
}

export interface ExtractedPdf {
  pages: string[];
  text: string;
  pageCount: number;
}

/** Extract text; throws UnparseableComplaint for non-PDFs, broken PDFs and scans with no text layer. */
export async function extractPdfText(bytes: Uint8Array): Promise<ExtractedPdf> {
  const head = new TextDecoder().decode(bytes.subarray(0, 1024));
  if (!head.includes("%PDF")) throw new UnparseableComplaint("not a PDF file");

  let pages: string[];
  let pageCount: number;
  try {
    const pdf = await getDocumentProxy(bytes);
    const out = await extractText(pdf, { mergePages: false });
    pages = out.text.map(cleanPageText);
    pageCount = out.totalPages;
    await pdf.cleanup();
  } catch (err) {
    throw new UnparseableComplaint(`could not read PDF: ${err instanceof Error ? err.message : err}`);
  }

  const text = pages.join("\n\n");
  const chars = text.replace(/\s+/g, "").length;
  if (chars < 500 || chars / Math.max(pageCount, 1) < MIN_CHARS_PER_PAGE) {
    throw new UnparseableComplaint(
      `no usable text layer (${chars} characters over ${pageCount} pages; likely a scanned PDF)`,
      pageCount,
      chars,
    );
  }
  return { pages, text, pageCount };
}

function cleanPageText(page: string): string {
  return page
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------------------------------------------------------------------------------------
// Excerpting long complaints: opening (parties, nature of the action), class allegations,
// count headings, and the prayer for relief, then as much of the rest as fits.

const CLASS_HEADING_RE =
  /\b(CLASS ACTION ALLEGATIONS|CLASS ALLEGATIONS|CLASS DEFINITIONS?|CLASS REPRESENTATION ALLEGATIONS|RULE 23 ALLEGATIONS)\b/;
const CLASS_FALLBACK_RE = /\b(on behalf of (himself|herself|themselves|itself|plaintiffs?)[^.]{0,120}\bclass\b|proposed class|Nationwide Class)/i;
const PRAYER_RE = /\b(PRAYER FOR RELIEF|REQUEST FOR RELIEF|RELIEF REQUESTED|DEMAND FOR RELIEF)\b/g;
const WHEREFORE_RE = /\bWHEREFORE\b/g;
const COUNT_HEADING_RE = /^.{0,20}\b(COUNT|CLAIM FOR RELIEF|CAUSE OF ACTION)\b.{0,200}$/gm;

function lastIndex(re: RegExp, text: string): number {
  let idx = -1;
  for (const m of text.matchAll(re)) idx = m.index ?? idx;
  return idx;
}

export function selectExcerpts(text: string, budget = MAX_PROMPT_CHARS): { text: string; truncated: boolean } {
  if (text.length <= budget) return { text, truncated: false };

  const ranges: [number, number][] = [];
  const add = (start: number, len: number) => {
    const s = Math.max(0, start);
    ranges.push([s, Math.min(text.length, s + len)]);
  };

  // Opening: caption, parties, nature of the action, facts.
  const openingLen = Math.floor(budget * 0.4);
  add(0, openingLen);

  // Class definition section (usually after the facts).
  let classIdx = text.slice(openingLen / 2).search(CLASS_HEADING_RE);
  if (classIdx >= 0) classIdx += Math.floor(openingLen / 2);
  else classIdx = text.search(CLASS_FALLBACK_RE);
  if (classIdx >= 0) add(classIdx - 1_000, Math.floor(budget * 0.2));

  // Prayer for relief (the last one, near the end), through the jury demand.
  let prayerIdx = lastIndex(PRAYER_RE, text);
  if (prayerIdx < text.length / 2) prayerIdx = Math.max(prayerIdx, lastIndex(WHEREFORE_RE, text));
  if (prayerIdx >= 0) add(prayerIdx - 500, Math.floor(budget * 0.12));
  else add(text.length - Math.floor(budget * 0.08), Math.floor(budget * 0.08));

  const merged = mergeRanges(ranges);
  let used = merged.reduce((n, [s, e]) => n + (e - s), 0);

  // Count headings as a compact list of legal claims.
  const counts = [...text.matchAll(COUNT_HEADING_RE)].map((m) => m[0].trim()).slice(0, 40);
  const countsBlock = counts.length ? `[Count headings found in the complaint]\n${counts.join("\n")}` : "";
  used += countsBlock.length;

  // Fill leftover budget by extending ranges forward into the gaps, earliest first.
  let spare = budget - used;
  for (let i = 0; i < merged.length && spare > 0; i++) {
    const next = merged[i + 1]?.[0] ?? text.length;
    const grow = Math.min(spare, next - merged[i][1]);
    merged[i][1] += grow;
    spare -= grow;
  }

  const parts = mergeRanges(merged).map(([s, e]) => text.slice(s, e));
  const joined = parts.join("\n\n[... omitted ...]\n\n");
  return { text: countsBlock ? `${joined}\n\n${countsBlock}` : joined, truncated: true };
}

function mergeRanges(ranges: [number, number][]): [number, number][] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else out.push([r[0], r[1]]);
  }
  return out;
}

// ---------------------------------------------------------------------------------------
// LLM

export class ComplaintAnalysisSkipped extends Error {}

function describeCase(c: ComplaintCandidate): string {
  return [
    `Case name: ${c.caseName}`,
    `Court: ${c.court}`,
    `Docket number: ${c.docketNumber ?? "unknown"}`,
    `Date filed: ${c.dateFiled ?? "unknown"}`,
    `Nature of suit: ${c.natureOfSuit ?? "unknown"}`,
  ].join("\n");
}

export async function analyzeComplaintText(
  c: ComplaintCandidate,
  complaintText: string,
  opts: { model?: string } = {},
): Promise<ComplaintAnalysis> {
  let output: ComplaintAnalysis;
  try {
    const result = await generateText({
      model: languageModel(opts.model ?? complaintModel()),
      system: SYSTEM_PROMPT,
      prompt: `${describeCase(c)}\n\n<complaint>\n${complaintText}\n</complaint>`,
      output: Output.object({ schema: ComplaintAnalysisSchema }),
      maxOutputTokens: 8_000,
      maxRetries: 2,
      abortSignal: AbortSignal.timeout(180_000),
    });
    output = result.output;
  } catch (err) {
    if (NoObjectGeneratedError.isInstance(err)) {
      throw new ComplaintAnalysisSkipped(`model returned no valid JSON (${err.finishReason ?? "unknown"})`);
    }
    throw err;
  }
  return normalizeAnalysis(output);
}

function normalizeAnalysis(a: ComplaintAnalysis): ComplaintAnalysis {
  const money = (n: number | null) => (n != null && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null);
  let low = money(a.estimated_payout.low_usd);
  let high = money(a.estimated_payout.high_usd);
  if (low != null && high != null && low > high) [low, high] = [high, low];
  return {
    ...a,
    estimated_payout: {
      ...a.estimated_payout,
      low_usd: low,
      high_usd: high,
      // Never rely on the model for the disclaimer.
      disclaimer: PAYOUT_DISCLAIMER,
    },
  };
}

// ---------------------------------------------------------------------------------------
// Pipeline

export interface ParseComplaintsOptions {
  limit: number;
  ids?: string[];
  force?: boolean;
  model?: string;
  log?: (msg: string) => void;
}

function isAuthError(err: unknown): boolean {
  const e = (err as { lastError?: unknown })?.lastError ?? err;
  const status = (e as { statusCode?: number })?.statusCode;
  const name = (e as { name?: string })?.name ?? "";
  return status === 401 || status === 403 || /Authentication|Forbidden/.test(name);
}

export async function parsePendingComplaints(opts: ParseComplaintsOptions) {
  const log = opts.log ?? console.log;
  const stats = { parsed: 0, unparseable: 0, skipped: 0, failed: 0 };
  const model = opts.model ?? complaintModel();
  const missing = missingCredentials(model);
  if (missing) {
    log(`${missing}; skipping complaint parsing.`);
    return stats;
  }
  const candidates = await listComplaintsToParse({ limit: opts.limit, ids: opts.ids, force: opts.force });
  log(`Parsing ${candidates.length} complaint(s) with ${model}`);

  for (const c of candidates) {
    try {
      const pdf = await extractPdfText(await downloadPdf(c.complaintUrl));
      const { text, truncated } = selectExcerpts(pdf.text);
      const analysis = await analyzeComplaintText(c, text, { model });
      await saveComplaintAnalysis({
        caseId: c.id,
        complaintUrl: c.complaintUrl,
        status: "parsed",
        pageCount: pdf.pageCount,
        textChars: pdf.text.length,
        truncated,
        model,
        analysis,
      });
      stats.parsed++;
      const p = analysis.estimated_payout;
      const payout = p.low_usd != null || p.high_usd != null ? `$${p.low_usd ?? "?"}-$${p.high_usd ?? "?"}` : "n/a";
      log(
        `  ${c.id} parsed (${pdf.pageCount}p${truncated ? ", excerpted" : ""}${analysis.is_complaint ? "" : ", not a complaint?"}) payout ${payout} | ${c.caseName}`,
      );
    } catch (err) {
      if (err instanceof UnparseableComplaint) {
        await saveComplaintAnalysis({
          caseId: c.id,
          complaintUrl: c.complaintUrl,
          status: "unparseable",
          error: err.message,
          pageCount: err.pageCount,
          textChars: err.textChars,
        });
        stats.unparseable++;
        log(`  ${c.id} unparseable: ${err.message}`);
      } else if (err instanceof ComplaintAnalysisSkipped) {
        stats.skipped++;
        log(`  ${c.id} skipped: ${err.message}`);
      } else if (isAuthError(err)) {
        stats.failed++;
        log(`AI provider rejected the request (authentication or model access); stopping. ${err instanceof Error ? err.message : ""}`);
        break;
      } else {
        // Transient (network, rate limit, gateway error): leave unrecorded so the next run retries.
        stats.failed++;
        log(`  ${c.id} failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  return stats;
}
