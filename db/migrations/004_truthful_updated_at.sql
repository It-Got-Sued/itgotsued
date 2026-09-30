-- Only bump cases.updated_at when case content actually changes.
-- Ingest upserts rewrite every row and set last_checked = now(), which used to bump
-- updated_at on every run. The sitemap uses updated_at as <lastmod>, and search engines
-- stop trusting lastmod that changes when the page does not.
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - 'updated_at' - 'last_checked' - 'search')
     IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at' - 'last_checked' - 'search') THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END $$;
