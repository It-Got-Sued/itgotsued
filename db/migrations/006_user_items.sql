-- My Items saved to a signed-in account, so the list follows the user across devices and logins.
-- id is the client-generated item id; (user_id, label_key) keeps one row per item name per user.
CREATE TABLE user_items (
  id         text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label      text NOT NULL CHECK (length(label) BETWEEN 1 AND 200),
  label_key  text GENERATED ALWAYS AS (lower(btrim(label))) STORED,
  brand      text CHECK (brand IS NULL OR length(brand) <= 200),
  added_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, label_key)
);

CREATE INDEX user_items_user_idx ON user_items (user_id, added_at);
