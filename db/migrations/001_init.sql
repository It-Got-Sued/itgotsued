-- ClassActionForMe core schema (Neon Postgres).
-- Applied by scripts/db-migrate.ts; each migration runs once, inside a transaction.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Lifecycle of a class action, from complaint to claims closing.
CREATE TYPE case_status AS ENUM (
  'filed',
  'certified',
  'settlement_pending',
  'claims_open',
  'claims_closed',
  'dismissed',
  'unknown'
);

-- Federal (and later state) courts. id is the CourtListener court id, e.g. "cand".
CREATE TABLE courts (
  id           text PRIMARY KEY,
  name         text NOT NULL,
  jurisdiction text NOT NULL DEFAULT 'federal',   -- federal | state
  state        char(2)
);

-- One row per lawsuit (docket).
CREATE TABLE cases (
  id                text PRIMARY KEY,                 -- "cl-<docket id>" or "sample-<slug>"
  source            text NOT NULL,                    -- courtlistener | sample | ...
  source_id         text NOT NULL,                    -- id within the source
  source_url        text,
  case_name         text NOT NULL,
  court_id          text REFERENCES courts(id),
  court             text NOT NULL,                    -- display name, kept for sources without a court id
  docket_number     text,
  date_filed        date,
  date_terminated   date,
  status            case_status NOT NULL DEFAULT 'unknown',
  nature_of_suit    text,                             -- e.g. "370 Other Fraud"
  cause             text,                             -- e.g. "28:1332 Diversity-Fraud"
  summary           text,                             -- plain-language, AI-written
  who_qualifies     text,                             -- plain-language class definition
  complaint_url     text,
  claim_url         text,                             -- official administrator site; only for claims_open
  claim_deadline    date,
  settlement_amount text,                             -- display string, e.g. "$4,500,000"
  settlement_amount_cents bigint,                     -- parsed, for sorting and filters
  states            text[] NOT NULL DEFAULT '{}',     -- two-letter codes of affected states
  categories        text[] NOT NULL DEFAULT '{}',     -- e.g. {food_labeling, data_breach}
  is_sample         boolean NOT NULL DEFAULT false,   -- fictional development data
  enriched_at       timestamptz,                      -- last AI enrichment
  last_checked      timestamptz,                      -- last refresh from the source
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  search            tsvector GENERATED ALWAYS AS (
                      setweight(to_tsvector('english', coalesce(case_name, '')), 'A') ||
                      setweight(to_tsvector('english', coalesce(summary, '')), 'B') ||
                      setweight(to_tsvector('english', coalesce(who_qualifies, '')), 'C')
                    ) STORED,
  UNIQUE (source, source_id),
  CONSTRAINT claim_url_only_when_open CHECK (claim_url IS NULL OR status IN ('claims_open', 'claims_closed'))
);

CREATE INDEX cases_search_idx      ON cases USING gin (search);
CREATE INDEX cases_status_idx      ON cases (status, date_filed DESC);
CREATE INDEX cases_date_filed_idx  ON cases (date_filed DESC);
CREATE INDEX cases_deadline_idx    ON cases (claim_deadline) WHERE status = 'claims_open';
CREATE INDEX cases_states_idx      ON cases USING gin (states);
CREATE INDEX cases_categories_idx  ON cases USING gin (categories);
CREATE INDEX cases_name_trgm_idx   ON cases USING gin (case_name gin_trgm_ops);

-- Consumer brands and companies that lawsuits name, with parent-company links.
CREATE TABLE brands (
  id             text PRIMARY KEY,                    -- "brand_<normalized>"
  name           text NOT NULL,
  normalized     text NOT NULL UNIQUE,                -- lowercase key, e.g. "coca-cola"
  parent_company text,
  aliases        text[] NOT NULL DEFAULT '{}',
  category       text,
  is_sample      boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX brands_name_trgm_idx ON brands USING gin (name gin_trgm_ops);
CREATE INDEX brands_aliases_idx   ON brands USING gin (aliases);
CREATE INDEX brands_parent_idx    ON brands (parent_company);

-- Which brands a lawsuit names, and in what role.
CREATE TABLE case_brands (
  case_id  text NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  brand_id text NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  role     text NOT NULL DEFAULT 'defendant',         -- defendant | product | parent
  products text[] NOT NULL DEFAULT '{}',              -- product names at issue
  PRIMARY KEY (case_id, brand_id)
);

CREATE INDEX case_brands_brand_idx ON case_brands (brand_id);

-- Court filings on each docket.
CREATE TABLE docket_entries (
  id           bigserial PRIMARY KEY,
  case_id      text NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  entry_number integer,
  date_filed   date,
  description  text NOT NULL,
  document_url text
);

-- Dedupe on (case, entry number, description) even when entry_number is null.
CREATE UNIQUE INDEX docket_entries_dedupe_idx
  ON docket_entries (case_id, coalesce(entry_number, -1), md5(description));
CREATE INDEX docket_entries_case_idx ON docket_entries (case_id, entry_number);

-- Brand alert sign-ups.
CREATE TABLE watchlist (
  email      text NOT NULL,
  brand_id   text NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (email, brand_id)
);

-- Audit trail of ingestion and enrichment runs.
CREATE TABLE ingest_runs (
  id            bigserial PRIMARY KEY,
  kind          text NOT NULL,                        -- ingest | enrich | seed
  source        text NOT NULL,
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  cases_upserted integer NOT NULL DEFAULT 0,
  entries_added integer NOT NULL DEFAULT 0,
  params        jsonb NOT NULL DEFAULT '{}',
  error         text
);

-- Keep updated_at current.
CREATE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE TRIGGER cases_touch BEFORE UPDATE ON cases
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
