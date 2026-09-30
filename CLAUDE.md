@AGENTS.md

# Data writes: always upsert

Every write to the database must be idempotent so re-running ingest never creates duplicates.

- Use `INSERT ... ON CONFLICT (<natural key>) DO UPDATE SET ...` (or `DO NOTHING` for pure link rows). Never a bare `INSERT` into a data table.
- Natural keys: `cases (source, source_id)`, `courts (id)`, `brands (normalized)`, `case_brands (case_id, brand_id)`, `docket_entries (case_id, coalesce(entry_number, -1), md5(description))`, `complaint_analyses (case_id)`, `watchlist (email, brand_id)`, `case_follows (user_id, case_id)`, `case_notifications (user_id, case_id, kind)`.
- A new table needs a `UNIQUE` constraint or primary key on its natural key in its migration, and its writes go through an upsert.
- Append-only log tables (`ingest_runs`, `schema_migrations`) are the only exception.

# Case summaries: AI enrichment

`npm run enrich` fills each case's `summary` (200 words max, shown in the case page's Summary section), `who_qualifies`, brands, categories, states and settlement amount, and saves a `complaint_analyses` row when the complaint PDF is readable.

- Model: DeepSeek `deepseek-v4-pro` through `DEEPSEEK_API_KEY` in `.env`. Model ids are `<provider>/<model>`; `deepseek/...` calls DeepSeek directly and anything else goes through the Vercel AI Gateway (`src/lib/ingest/ai.ts`). Override with `ENRICH_MODEL`, `COMPLAINT_SUMMARY_MODEL` or `--model`. The AI Gateway account is on the free tier and rejects Claude models.
- Filings read: the complaint PDF (`cases.complaint_url`, on storage.courtlistener.com). When a case has no complaint URL, enrich first fetches its docket entries from CourtListener, then reads up to 3 other filings with PDFs, settlement filings first. The CourtListener docket API allows about 125 requests a day, so enrich stops calling it for the rest of a run after any HTTP error.
- Only cases with `enriched_at IS NULL` are picked up. Use `--id <case id>` or `--force` to redo a case.
- Enrich only changes `status` on cases that are `filed` or `unknown`. It never sets `claims_open`.
- Commands: `npm run enrich -- --limit 50`, `npm run enrich -- --id cl-70702473`, `npm run enrich -- --no-pdf` (docket text only).
