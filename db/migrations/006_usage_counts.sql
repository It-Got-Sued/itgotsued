-- Daily per-user usage of metered features (free accounts get a few scans a day).
CREATE TABLE usage_counts (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feature text NOT NULL,           -- e.g. 'scan'
  day     date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  count   integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, feature, day)
);
