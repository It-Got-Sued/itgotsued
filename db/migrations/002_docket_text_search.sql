-- Search inside docket entry text (e.g. "COMPLAINT against PepsiCo, Inc., The Gatorade Company").
CREATE INDEX docket_entries_description_trgm_idx
  ON docket_entries USING gin (description gin_trgm_ops);
