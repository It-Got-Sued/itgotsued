// Shared contracts for web, API, and the iPhone app (mobile/ imports this file).
// Do not redefine these types locally.

export type CaseStatus =
  | "filed"
  | "certified"
  | "settlement_pending"
  | "claims_open"
  | "claims_closed"
  | "dismissed"
  | "unknown";

export const CASE_STATUSES: CaseStatus[] = [
  "filed",
  "certified",
  "settlement_pending",
  "claims_open",
  "claims_closed",
  "dismissed",
  "unknown",
];

// Statuses that count as "active" for My Items matching (closed/dismissed excluded).
export const ACTIVE_STATUSES: CaseStatus[] = [
  "filed",
  "certified",
  "settlement_pending",
  "claims_open",
];

export interface CaseSummary {
  id: string;
  caseName: string;
  court: string;
  docketNumber: string | null;
  dateFiled: string | null; // ISO date
  status: CaseStatus;
  summary: string | null;
  brands: string[]; // display names of linked brands
  claimUrl: string | null;
  claimDeadline: string | null; // ISO date
  isSample: boolean;
}

export interface DocketEntry {
  entryNumber: number | null;
  dateFiled: string | null;
  description: string;
  documentUrl: string | null;
}

export interface CaseDetail extends CaseSummary {
  source: string; // "courtlistener" | "sample" | ...
  sourceUrl: string | null;
  natureOfSuit: string | null;
  whoQualifies: string | null;
  complaintUrl: string | null;
  settlementAmount: string | null;
  states: string[];
  categories: string[];
  lastChecked: string | null; // ISO datetime
  docketEntries: DocketEntry[];
}

export interface Brand {
  id: string;
  name: string; // display name, e.g. "Coca-Cola"
  normalized: string; // lowercase key, e.g. "coca-cola"
  parentCompany: string | null;
  aliases: string[];
  category: string | null;
}

// "manual" = an item the user typed into their My Items list (confidence 1).
export type DetectionSource = "photo" | "text" | "bank" | "receipt" | "manual";

// One entry in the user's My Items list. Stored on the device only (localStorage on
// web, AsyncStorage on iPhone); never sent to the server except inside a match request.
export interface OwnedItem {
  id: string;
  label: string; // what the user typed, e.g. "Crest toothpaste"
  brand?: string; // brand the user confirmed, if different from label
  addedAt: string; // ISO datetime
}

export interface MatchRequest {
  detections: BrandDetection[];
  activeOnly?: boolean; // only return cases in ACTIVE_STATUSES
}

export interface BrandDetection {
  brand: string; // as detected, e.g. "Coke", "AMZN Mktp"
  product?: string; // e.g. "Diet Coke can"
  category?: string; // e.g. "beverage"
  confidence: number; // 0..1
  source: DetectionSource;
}

export interface BrandMatch {
  brand: Brand;
  detections: BrandDetection[];
  cases: CaseSummary[];
  /** How this brand relates to what the user owns (set by /api/match). */
  relation?: "direct" | "parent" | "subsidiary";
  /** Detected brands that led to a parent/subsidiary match. */
  via?: string[];
  /** Parent matches: case id -> the user's brand named in that case's filings. */
  mentions?: Record<string, string>;
  /** Parent matches: the parent's lawsuits whose filings don't name the user's brand. */
  unverifiedCount?: number;
}

export interface CaseSearchParams {
  q?: string;
  status?: CaseStatus;
  brand?: string; // normalized brand key
  state?: string; // two-letter code
  page?: number; // 1-based
  pageSize?: number; // default 20
}

export interface CaseSearchResult {
  cases: CaseSummary[];
  total: number;
}
