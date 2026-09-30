-- AI reading of each case's complaint PDF (scripts/parse-complaints.ts).
-- One row per case; complaint_url records which PDF was read, so a new complaint URL
-- makes the case eligible again. status = 'unparseable' for scanned/empty/broken PDFs
-- (kept so they are not retried every run; use --force to retry).
CREATE TABLE complaint_analyses (
  case_id       text PRIMARY KEY REFERENCES cases(id) ON DELETE CASCADE,
  complaint_url text NOT NULL,
  status        text NOT NULL CHECK (status IN ('parsed', 'unparseable')),
  error         text,                               -- why it is unparseable
  page_count    integer,
  text_chars    integer,                            -- characters extracted from the PDF
  truncated     boolean NOT NULL DEFAULT false,     -- true if only excerpts were sent to the model
  model         text,                               -- gateway model id, e.g. anthropic/claude-sonnet-5.5
  analysis      jsonb,                              -- validated ComplaintAnalysis (see src/lib/ingest/complaint.ts)
  parsed_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX complaint_analyses_status_idx ON complaint_analyses (status);
