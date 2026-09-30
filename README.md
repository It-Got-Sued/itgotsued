# It Got Sued (ClassActionForMe)

One index of U.S. class action lawsuits, matched to the things people own. See `PLAN.md` for
the product plan and `mobile/README.md` for the iPhone app.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill it in:
   - `DATABASE_URL` / `DATABASE_URL_UNPOOLED`: Neon Postgres (pooled for the app, direct for migrations)
   - `COURTLISTENER_TOKEN`: CourtListener API token
   - `ANTHROPIC_API_KEY`: photo/text brand detection and case summaries
   - `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`: optional bank scan
3. `npm run db:migrate` to create the schema (`db/migrations/*.sql`)
4. `npm run db:seed` to load the brand dictionary (`data/brands.json`)
5. `npm run dev` and open http://localhost:3000

## Loading lawsuits

| Command | What it does |
|---|---|
| `npm run ingest -- --since 2026-01-01 --all-nos --no-details --limit 20000` | Every federal class action filed since a date (CourtListener RECAP search) |
| `npm run ingest -- --settlement-since 2026-01-01 --no-details` | Older class cases with settlement activity since a date (preliminary/final approval, claims deadlines) |
| `npm run refresh` | Last 3 days of new cases plus last 7 days of settlement activity; run daily |
| `npm run infer-status` | Set each case's stage from its court filings (no AI; forward-only) |
| `npm run link-brands` | Link cases to brands when the defendant is a known brand or parent company (no AI) |
| `npm run enrich -- --limit 100` | AI summaries, who qualifies, brands and status (needs `ANTHROPIC_API_KEY`) |
| `npm run simulate:parent -- Gatorade Cheetos` | Show how owned brands reach parent-company lawsuits |

Searches on `/cases` that find nothing also ask CourtListener live and store any matching
class action, so a case name from a settlement email is found even before the next refresh.

## Parent companies

A brand the user owns (Gatorade) reaches lawsuits against its parent company (PepsiCo) only
when that lawsuit's filings name the brand ("COMPLAINT against PepsiCo, Inc., The Gatorade
Company"). Parent lawsuits that don't name it are counted but not shown as matches. Owning the
company itself shows all of its lawsuits and its brands' lawsuits.

## Tests

```bash
npx tsx src/lib/brands/__tests__/run-all.ts   # brand detection and matching (no DB needed)
npx tsx src/lib/plaid/__tests__/plaid.test.ts # bank scan mapping
npx tsc --noEmit -p .
```
