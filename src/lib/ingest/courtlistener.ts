// CourtListener REST API v4 client + mapping to our case records.
// Docs: https://www.courtlistener.com/help/api/rest/ (search, PACER data, FJC IDB).
//
// - Search (`/api/rest/v4/search/?type=r`) works anonymously; results are dockets with up
//   to three nested RECAP documents that matched the query, cursor-paginated via `next`.
// - `/dockets/` and `/docket-entries/` require a token (Authorization: Token <token>).
//   Dockets carry `idb_data` (FJC Integrated Database), whose `class_action` field is the
//   civil cover sheet's class action indicator when the IDB row exists.
// - Throttles (default for authenticated users) are 5/min, 50/hour, 125/day on a rolling
//   window, so every request goes through a paced fetch that honours 429 Retry-After.

import type { DocketEntry } from "@/lib/types";

export const CL_BASE = "https://www.courtlistener.com";
export const CL_API = `${CL_BASE}/api/rest/v4`;
export const CL_STORAGE = "https://storage.courtlistener.com";

/** Nature-of-suit codes typical of consumer class actions. */
export const CONSUMER_NOS = ["190", "370", "371", "380", "385", "480", "485", "890"];

/**
 * Phrases that appear in class action filings; cause 28:1453 is CAFA removal.
 * Pass `nos = null` to search every nature of suit (securities, privacy, employment, ...).
 */
export function buildClassActionQuery(nos: string[] | null = CONSUMER_NOS): string {
  // Not the bare phrase "class action": every civil cover sheet has a "class action" checkbox,
  // so it matches ordinary contract and civil rights suits.
  const signals = [
    '"class action complaint"',
    '"all others similarly situated"',
    '"all other similarly situated"',
    '"putative class"',
    '"proposed class"',
    '"on behalf of a class"',
    '"class representative"',
    'cause:"1453"',
  ].join(" OR ");
  return nos ? `(${signals}) AND suitNature:(${nos.join(" OR ")})` : `(${signals})`;
}

/**
 * Class settlements with court activity since `since` (YYYY-MM-DD), whatever year the case was
 * filed. Catches older cases (e.g. filed in 2025) that are now paying out.
 */
export function buildSettlementActivityQuery(since: string): string {
  const settlement = [
    '"preliminary approval"',
    '"final approval"',
    '"claims deadline"',
    '"claim deadline"',
    '"settlement administrator"',
    '"class settlement"',
  ].join(" OR ");
  return `(${settlement}) AND ("class action settlement" OR "class settlement" OR "settlement class" OR "class members") AND entry_date_filed:[${since} TO *]`;
}

export interface ClRecapDocument {
  id: number;
  absolute_url: string | null;
  attachment_number: number | null;
  description: string;
  short_description?: string;
  document_number: number | string | null;
  entry_number: number | null;
  entry_date_filed: string | null;
  filepath_local: string | null;
  is_available: boolean | null;
  page_count?: number | null;
}

export interface ClSearchDocket {
  docket_id: number;
  caseName: string;
  case_name_full?: string;
  court: string;
  court_id: string;
  docketNumber: string | null;
  dateFiled: string | null;
  dateTerminated: string | null;
  suitNature: string | null;
  cause: string | null;
  docket_absolute_url: string;
  recap_documents: ClRecapDocument[];
}

export interface ClSearchPage {
  count?: number;
  next: string | null;
  results: ClSearchDocket[];
}

export class ClHttpError extends Error {
  constructor(
    public status: number,
    public url: string,
    body: string,
  ) {
    super(`CourtListener ${status} for ${url}: ${body.slice(0, 200)}`);
  }
}

export interface ClClientOptions {
  token?: string;
  /** Minimum spacing between requests. */
  minIntervalMs?: number;
  maxRetries?: number;
  log?: (msg: string) => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class CourtListenerClient {
  private last = 0;
  private opts: Required<Omit<ClClientOptions, "token">> & { token?: string };
  requests = 0;

  constructor(opts: ClClientOptions = {}) {
    this.opts = {
      token: opts.token,
      minIntervalMs: opts.minIntervalMs ?? 1500,
      maxRetries: opts.maxRetries ?? 4,
      log: opts.log ?? (() => {}),
    };
  }

  get hasToken(): boolean {
    return Boolean(this.opts.token);
  }

  async get<T>(pathOrUrl: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(pathOrUrl.startsWith("http") ? pathOrUrl : `${CL_API}${pathOrUrl}`);
    for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v);
    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": "ClassActionForMe ingest (+https://classactionforme.com)",
    };
    if (this.opts.token) headers.Authorization = `Token ${this.opts.token}`;

    for (let attempt = 0; ; attempt++) {
      const wait = this.last + this.opts.minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      this.last = Date.now();
      this.requests++;
      let res: Response;
      try {
        res = await fetch(url, { headers });
      } catch (err) {
        if (attempt >= this.opts.maxRetries) throw err;
        await sleep(2 ** attempt * 2000);
        continue;
      }
      if (res.ok) return (await res.json()) as T;
      const body = await res.text();
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= this.opts.maxRetries) {
        throw new ClHttpError(res.status, url.toString(), body);
      }
      const retryAfter = Number(res.headers.get("retry-after"));
      const delay =
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 5000;
      this.opts.log(`  HTTP ${res.status}; retrying in ${Math.round(delay / 1000)}s`);
      await sleep(Math.min(delay, 15 * 60 * 1000));
    }
  }

  search(params: Record<string, string>): Promise<ClSearchPage> {
    return this.get<ClSearchPage>("/search/", { type: "r", ...params });
  }

  /** Individual RECAP documents (main filings and attachments) matching `q`. */
  searchDocuments(q: string): Promise<{ results: ClRecapDocument[] }> {
    return this.get("/search/", { type: "rd", q });
  }

  /**
   * A docket's exhibits that state settlement claim terms (settlement agreement, claim form,
   * class notice) and have a stored PDF: agreements first, then claim forms, then notices,
   * newest filing first within each. One search request; no docket API quota.
   */
  async claimTermExhibits(docketId: number): Promise<ClRecapDocument[]> {
    const { results } = await this.searchDocuments(
      `docket_id:${docketId} AND attachment_number:[1 TO *] AND short_description:(settlement OR notice OR claim)`,
    );
    return (results ?? [])
      .filter((d) => d.filepath_local && claimTermRank(d.short_description ?? "") < CLAIM_TERM_KINDS.length)
      .sort(
        (a, b) =>
          claimTermRank(a.short_description ?? "") - claimTermRank(b.short_description ?? "") ||
          (b.entry_number ?? 0) - (a.entry_number ?? 0),
      );
  }

  docket(id: number): Promise<Record<string, unknown>> {
    return this.get(`/dockets/${id}/`);
  }

  docketEntries(docketId: number, pageSize = 100): Promise<{ results: ClDocketEntry[] }> {
    return this.get("/docket-entries/", {
      docket: String(docketId),
      order_by: "entry_number",
      page_size: String(pageSize),
    });
  }
}

const CLAIM_TERM_KINDS = [
  /\b(settlement agreement|stipulation of settlement|agreement of settlement)\b/i,
  /\bclaim form\b/i,
  /\bnotice\b/i,
];
const NOT_CLAIM_TERMS_RE = /\b(declaration|proposed order|objection|brief|memorandum|transcript)\b/i;

/** Index into CLAIM_TERM_KINDS, or CLAIM_TERM_KINDS.length when the exhibit is none of them. */
function claimTermRank(exhibitName: string): number {
  if (NOT_CLAIM_TERMS_RE.test(exhibitName)) return CLAIM_TERM_KINDS.length;
  const i = CLAIM_TERM_KINDS.findIndex((re) => re.test(exhibitName));
  return i < 0 ? CLAIM_TERM_KINDS.length : i;
}

export interface ClDocketEntry {
  entry_number: number | null;
  date_filed: string | null;
  description: string;
  recap_documents?: ClRecapDocument[];
}

// ---------------------------------------------------------------------------
// Mapping

export function caseIdForDocket(docketId: number | string): string {
  return `cl-${docketId}`;
}

function absolute(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.startsWith("http") ? url : `${CL_BASE}${url}`;
}

export function documentUrl(d: Pick<ClRecapDocument, "filepath_local" | "absolute_url">): string | null {
  if (d.filepath_local) return `${CL_STORAGE}/${d.filepath_local}`;
  return absolute(d.absolute_url);
}

const COMPLAINT_RE = /\b(class action )?complaint\b/i;
const NOT_COMPLAINT_RE = /\b(answer|motion|notice of appearance|order|stipulation|summons)\b/i;

/** Best complaint PDF among RECAP documents: entry 1 (or a "COMPLAINT" entry), main doc, available. */
export function pickComplaintUrl(docs: ClRecapDocument[]): string | null {
  const candidates = docs.filter(
    (d) =>
      d.filepath_local &&
      (Number(d.document_number) === 1 || d.entry_number === 1 ||
        (COMPLAINT_RE.test(d.description) && !NOT_COMPLAINT_RE.test(d.description.slice(0, 40)))),
  );
  candidates.sort(
    (a, b) =>
      (a.attachment_number ?? 0) - (b.attachment_number ?? 0) ||
      (a.entry_number ?? 99) - (b.entry_number ?? 99),
  );
  return candidates[0] ? `${CL_STORAGE}/${candidates[0].filepath_local}` : null;
}

export function toDocketEntries(docs: ClRecapDocument[]): DocketEntry[] {
  // One row per docket entry: prefer the main document (attachment_number null/0).
  const byEntry = new Map<string, DocketEntry & { attachment: number }>();
  for (const d of docs) {
    const description = (d.description || d.short_description || "").trim();
    if (!description) continue;
    const key = `${d.entry_number ?? d.document_number ?? "?"}|${description}`;
    const attachment = d.attachment_number ?? 0;
    const prev = byEntry.get(key);
    if (prev && prev.attachment <= attachment) continue;
    byEntry.set(key, {
      entryNumber: d.entry_number ?? (d.document_number != null ? Number(d.document_number) : null),
      dateFiled: d.entry_date_filed ?? null,
      description,
      documentUrl: documentUrl(d),
      attachment,
    });
  }
  return [...byEntry.values()].map(({ attachment: _a, ...e }) => e);
}

export function fromDocketEntriesApi(entries: ClDocketEntry[]): {
  entries: DocketEntry[];
  docs: ClRecapDocument[];
} {
  const docs: ClRecapDocument[] = [];
  const out: DocketEntry[] = [];
  for (const e of entries) {
    const main =
      e.recap_documents?.find((d) => !d.attachment_number) ?? e.recap_documents?.[0];
    if (e.recap_documents) {
      for (const d of e.recap_documents) {
        docs.push({ ...d, entry_number: e.entry_number, entry_date_filed: e.date_filed });
      }
    }
    const description = (e.description || main?.description || "").trim();
    if (!description) continue;
    out.push({
      entryNumber: e.entry_number,
      dateFiled: e.date_filed,
      description,
      documentUrl: main ? documentUrl(main) : null,
    });
  }
  return { entries: out, docs };
}

/** Map a search hit to the fields upsertCaseRecord takes. */
export function toCaseRecord(r: ClSearchDocket, docs: ClRecapDocument[] = r.recap_documents ?? []) {
  return {
    id: caseIdForDocket(r.docket_id),
    source: "courtlistener",
    sourceId: String(r.docket_id),
    sourceUrl: `${CL_BASE}${r.docket_absolute_url}`,
    caseName: cleanCaseName(r.caseName || r.case_name_full || `Docket ${r.docket_id}`),
    court: r.court || r.court_id,
    courtId: r.court_id || null,
    dateFiled: r.dateFiled || null,
    dateTerminated: r.dateTerminated || null,
    docketNumber: r.docketNumber || null,
    // Default 'filed'; a terminated docket's outcome is unknown until its filings say more.
    status: r.dateTerminated ? ("unknown" as const) : ("filed" as const),
    natureOfSuit: r.suitNature?.trim() || null,
    cause: r.cause?.trim() || null,
    complaintUrl: pickComplaintUrl(docs),
  };
}

/** "Burnell, individually and on behalf of all others similarly situated v. Mazda" -> "Burnell v. Mazda". */
export function cleanCaseName(name: string): string {
  return name
    .replace(/,?\s+(individually\s+and\s+)?on\s+behalf\s+of\s+(himself|herself|themselves|itself|themself)?\s*(and\s+)?all\s+others?\s+similarly\s+situated,?/gi, "")
    .replace(/,?\s+individually(\s+and\s+as\s+[^v]+?)?(?=\s+v\.?\s)/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
