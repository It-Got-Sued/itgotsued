-- Cases a signed-in user follows from the case page. One row per (user, case).
CREATE TABLE case_follows (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  case_id    text NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, case_id)
);

CREATE INDEX case_follows_case_idx ON case_follows (case_id);
