@AGENTS.md

# Data writes: always upsert

Every write to the database must be idempotent so re-running ingest never creates duplicates.

- Use `INSERT ... ON CONFLICT (<natural key>) DO UPDATE SET ...` (or `DO NOTHING` for pure link rows). Never a bare `INSERT` into a data table.
- Natural keys: `cases (source, source_id)`, `courts (id)`, `brands (normalized)`, `case_brands (case_id, brand_id)`, `docket_entries (case_id, coalesce(entry_number, -1), md5(description))`, `complaint_analyses (case_id)`, `watchlist (email, brand_id)`.
- A new table needs a `UNIQUE` constraint or primary key on its natural key in its migration, and its writes go through an upsert.
- Append-only log tables (`ingest_runs`, `schema_migrations`) are the only exception.
