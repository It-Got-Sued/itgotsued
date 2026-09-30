-- Emails sent to people following a case, so each follower gets each notice at most once.
-- kind: 'claims_open' (the settlement claim form opened).
CREATE TABLE case_notifications (
  user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  case_id  text NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  kind     text NOT NULL,
  sent_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, case_id, kind)
);
