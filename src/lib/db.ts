import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

// SQLite via Node's built-in driver for the MVP. Swap for Postgres in production.

const SCHEMA = `
CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  source_id TEXT,
  source_url TEXT,
  case_name TEXT NOT NULL,
  court TEXT NOT NULL,
  docket_number TEXT,
  date_filed TEXT,
  status TEXT NOT NULL DEFAULT 'unknown',
  nature_of_suit TEXT,
  summary TEXT,
  who_qualifies TEXT,
  complaint_url TEXT,
  claim_url TEXT,
  claim_deadline TEXT,
  settlement_amount TEXT,
  states TEXT NOT NULL DEFAULT '[]',
  categories TEXT NOT NULL DEFAULT '[]',
  is_sample INTEGER NOT NULL DEFAULT 0,
  last_checked TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (source, source_id)
);

CREATE TABLE IF NOT EXISTS brands (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  normalized TEXT NOT NULL UNIQUE,
  parent_company TEXT,
  aliases TEXT NOT NULL DEFAULT '[]',
  category TEXT
);

CREATE TABLE IF NOT EXISTS case_brands (
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'defendant',
  products TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (case_id, brand_id)
);

CREATE TABLE IF NOT EXISTS docket_entries (
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  entry_number INTEGER,
  date_filed TEXT,
  description TEXT NOT NULL,
  document_url TEXT
);

CREATE TABLE IF NOT EXISTS watchlist (
  email TEXT NOT NULL,
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (email, brand_id)
);

CREATE VIRTUAL TABLE IF NOT EXISTS cases_fts USING fts5(
  case_name, summary, who_qualifies, content='cases', content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS cases_ai AFTER INSERT ON cases BEGIN
  INSERT INTO cases_fts(rowid, case_name, summary, who_qualifies)
  VALUES (new.rowid, new.case_name, new.summary, new.who_qualifies);
END;
CREATE TRIGGER IF NOT EXISTS cases_ad AFTER DELETE ON cases BEGIN
  INSERT INTO cases_fts(cases_fts, rowid, case_name, summary, who_qualifies)
  VALUES ('delete', old.rowid, old.case_name, old.summary, old.who_qualifies);
END;
CREATE TRIGGER IF NOT EXISTS cases_au AFTER UPDATE ON cases BEGIN
  INSERT INTO cases_fts(cases_fts, rowid, case_name, summary, who_qualifies)
  VALUES ('delete', old.rowid, old.case_name, old.summary, old.who_qualifies);
  INSERT INTO cases_fts(rowid, case_name, summary, who_qualifies)
  VALUES (new.rowid, new.case_name, new.summary, new.who_qualifies);
END;

CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
CREATE INDEX IF NOT EXISTS idx_case_brands_brand ON case_brands(brand_id);
CREATE INDEX IF NOT EXISTS idx_docket_case ON docket_entries(case_id);
`;

let db: DatabaseSync | null = null;

export function openDb(dbPath = process.env.DATABASE_PATH ?? "./data/app.db"): DatabaseSync {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const conn = new DatabaseSync(dbPath);
  conn.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  conn.exec(SCHEMA);
  return conn;
}

export function getDb(): DatabaseSync {
  if (!db) db = openDb();
  return db;
}
