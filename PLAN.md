# ClassActionForMe — Product & Build Plan

## What it is

One searchable index of every class action lawsuit on U.S. court dockets. Users can
browse the index, open a lawsuit, read the complaint and docket, and — when a settlement
has an open claim form — follow a link to apply on the official settlement website.

The core differentiator: users do not have to know which lawsuits apply to them. They
describe what they own, snap a photo of their surroundings, or (optionally) connect a
bank account, and we surface the lawsuits that name those brands.

## Case lifecycle (drives the UI)

| Status | Meaning | What the user can do |
|---|---|---|
| `filed` | Complaint filed, no class yet | Read, follow for updates |
| `certified` | Court certified the class | Read, follow; class members usually included automatically |
| `settlement_pending` | Settlement proposed, awaiting approval | Read, follow |
| `claims_open` | Approved settlement with open claim form | **Apply** (link out to the administrator) |
| `claims_closed` | Claim deadline passed | Read |
| `dismissed` | Case dismissed | Read |
| `unknown` | Not yet classified | Read |

We never file claims for users. "Apply" always links to the official settlement
administrator site.

## How we beat existing sites

Current competitors (Top Class Actions, ClassAction.org, Open Class Actions, Claim Depot)
are hand-curated lists of settlements. They miss most filed cases and make users do the
matching work themselves.

1. **"What do you own?" box** — free-text description ("I use Crest toothpaste, drink
   Coke, take Nature Made vitamins") is parsed into brands and matched to lawsuits.
2. **My Items list** — users type the things they own, one per line or one at a time
   ("Crest toothpaste", "Peloton bike", "Nature Made vitamins"). The list is saved on
   their device only, and is matched against the docket to show every **active**
   lawsuit (filed, certified, settlement pending, claims open) naming those brands.
   Items found by photo or bank scan can be added to the list with one tap. The list is
   re-checked each visit, so new lawsuits against items the user owns show up
   automatically.
3. **Photo scan** — the user photographs a room, bathroom shelf, or pantry. A vision
   model detects brands (Coca-Cola can, CeraVe cream, Nature Made bottle, Crest tube)
   with a confidence score, and the user confirms detections before matching. Photos are
   processed in memory and never stored.
4. **Bank scan (optional, Plaid)** — read-only transaction scan, merchants normalized to
   brands, matched to lawsuits. The Plaid item is removed and all transaction data is
   discarded as soon as processing finishes. Only the list of matched brand names returns
   to the browser. Limitation: bank data shows merchants (Amazon, Walmart, Peloton,
   Verizon), not individual products — so it is strongest for services, subscriptions,
   telecoms, banks, airlines, and direct-to-consumer brands. Receipt scanning covers
   product-level purchases.
5. **Full docket coverage** — every federal class action from CourtListener/RECAP and
   PACER, not only settlements. Users learn about cases years before a settlement.
6. **Plain-language summaries** — AI summary of each complaint: who is suing, what
   product, who qualifies, what happens next, with page citations.
7. **Brand watchlist + alerts** — follow a brand; get notified when a new lawsuit is
   filed or a claim form opens.
8. **Deadline calendar** — add claim deadlines to your calendar (.ics) in one tap.
9. **Parent-company mapping** — a lawsuit against The Coca-Cola Company also surfaces for
   Dasani, Minute Maid, and Smartwater users.
10. **Privacy as a feature** — no account required to scan; zero retention of photos and
   transactions; transparent data-handling page.

Later: receipt/email-receipt scanning, browser extension that flags products at
checkout, recall feeds (CPSC/FDA) linked to lawsuits, household profiles, Spanish
language, SMS alerts, B2B data API.

## iPhone app

A native-feeling iOS app ships alongside the web app, sharing the same backend API.

- **Stack:** Expo (React Native, TypeScript) with Expo Router. Shares `src/lib/types.ts`
  contracts with the web app. Built and submitted with EAS Build / EAS Submit.
- **Why Expo over SwiftUI:** one TypeScript codebase for types and API calls, fast
  iteration, and Android later at little extra cost. Native modules cover camera and Plaid.
- **Screens:** Home (search + "What do you own?" box), My Items (typed list, matched
  to active lawsuits), Scan (camera), Bank scan,
  Results (matched brands and lawsuits), Case detail (summary, docket, complaint PDF,
  Apply button), Watchlist, Settings/Privacy.
- **Mobile-only advantages:**
  - **Live camera scan** — point the camera at a shelf or pantry; frames are sent for
    brand detection and results appear as chips the user confirms.
  - **Photo library import** — pick existing photos of products or receipts.
  - **Push notifications** — new lawsuit or open claim form for a watched brand
    (Expo Notifications / APNs).
  - **Share sheet** — share a product page or receipt from Safari or Photos into the app.
  - **Deadline reminders** — add claim deadlines to the iOS calendar.
- **Plaid:** `react-native-plaid-link-sdk` with the same `/api/plaid/*` endpoints;
  requires Plaid's iOS redirect URI / universal link setup.
- **Privacy:** photos are uploaded only for detection and never stored; the App Store
  privacy label declares no data linked to the user for scans. Camera and photo-library
  usage strings explain the purpose.
- **App Store review:** the app provides information, not legal advice, and links out to
  official settlement sites; no claim filing inside the app.

## Architecture

- **Next.js (App Router, TypeScript, Tailwind)** — web app and API routes.
- **SQLite via Node's built-in `node:sqlite`** — zero-dependency local DB for the MVP.
  Move to Postgres for production.
- **Anthropic Claude** — brand detection from photos and text; complaint summaries and
  brand extraction during ingestion.
- **Plaid** — optional bank transaction scan (sandbox in development).
- **CourtListener REST API** — federal dockets and RECAP documents.

### Directory ownership

| Area | Paths |
|---|---|
| Shared contracts | `src/lib/types.ts`, `src/lib/db.ts`, `src/lib/repo/*` |
| Data ingestion | `scripts/*`, `src/app/api/cases/*`, `data/*` |
| Brand intelligence | `src/lib/brands/*`, `src/app/api/detect/*`, `src/app/api/match/*` |
| Bank scan | `src/lib/plaid/*`, `src/app/api/plaid/*` |
| Web frontend | `src/app/**/page.tsx`, `src/app/layout.tsx`, `src/components/*` |
| iPhone app | `mobile/*` (Expo project) |

### API

| Method | Path | Body / query | Returns |
|---|---|---|---|
| GET | `/api/cases` | `q, status, brand, state, page` | `{ cases: CaseSummary[], total }` |
| GET | `/api/cases/[id]` | — | `CaseDetail` |
| POST | `/api/detect/text` | `{ description }` | `{ detections: BrandDetection[] }` |
| POST | `/api/detect/image` | multipart `image` | `{ detections: BrandDetection[] }` |
| POST | `/api/plaid/link-token` | — | `{ linkToken }` |
| POST | `/api/plaid/scan` | `{ publicToken }` | `{ detections: BrandDetection[] }` |
| POST | `/api/match` | `{ detections, activeOnly? }` (`MatchRequest`) | `{ matches: BrandMatch[] }` |
| POST | `/api/watchlist` | `{ email, brand }` | `{ ok }` |

## Legal and compliance

- Information only, never legal advice; disclaimer on every case page.
- No filing claims on users' behalf; link out to administrators only.
- Law-firm lead sales require a bar-rules review (ABA Model Rule 7.2 and state rules)
  before launch.
- Sponsored placements must be labeled.
- Privacy: CCPA and state privacy laws; zero retention of photos and transactions;
  Plaid item removal after each scan.
- Every case page shows the source link and a "last checked" date.
- Sample/development data uses fictional companies and is flagged `is_sample`.

## Revenue

1. Ads and affiliate links on settlement pages.
2. Premium alerts and continuous monitoring.
3. B2B data API (law firms, journalists, researchers).
4. Law-firm lead generation, only after legal review.

## Phases

1. **MVP (this build):** federal ingestion, search, case pages, text/photo/bank scan,
   matching, watchlist capture; iPhone app with search, case pages, camera scan, text
   box, and bank scan against the same API.
2. **Months 2–4:** TestFlight beta then App Store launch, push notifications,
   alerts delivery, deadline calendar, SEO company pages, settlement
   administrator scrapers.
3. **Months 4–12:** state courts (CA, NY, IL first), receipt scanning, browser extension,
   B2B API.

## Environment variables

```
ANTHROPIC_API_KEY=
PLAID_CLIENT_ID=
PLAID_SECRET=
PLAID_ENV=sandbox
COURTLISTENER_TOKEN=
DATABASE_PATH=./data/app.db
```
