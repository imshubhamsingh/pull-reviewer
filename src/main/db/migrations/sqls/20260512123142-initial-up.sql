CREATE TABLE tours (
  pr_id                 TEXT PRIMARY KEY,
  repo                  TEXT NOT NULL,
  pr_number             INTEGER NOT NULL,
  head_ref_oid          TEXT NOT NULL,
  base_ref_oid          TEXT,
  previous_head_ref_oid TEXT,                     -- set on regenerate; powers "commits since last tour" delta
  steps_json            TEXT NOT NULL,
  files_json            TEXT NOT NULL DEFAULT '[]',
  generated_at          TEXT NOT NULL,
  last_checked_at       TEXT NOT NULL,
  last_accessed_at      TEXT NOT NULL,
  provider              TEXT NOT NULL,
  model                 TEXT NOT NULL
);
CREATE INDEX idx_tours_repo_pr ON tours(repo, pr_number);

CREATE TABLE file_snapshots (
  repo        TEXT NOT NULL,
  sha         TEXT NOT NULL,
  path        TEXT NOT NULL,
  content     TEXT,
  encoding    TEXT NOT NULL,
  size        INTEGER NOT NULL,
  fetched_at  TEXT NOT NULL,
  accessed_at TEXT NOT NULL,
  PRIMARY KEY (repo, sha, path)
);
CREATE INDEX idx_file_snapshots_accessed_at ON file_snapshots(accessed_at);

CREATE TABLE clones (
  repo             TEXT PRIMARY KEY,
  path             TEXT NOT NULL,
  cloned_at        TEXT NOT NULL,
  last_fetched_at  TEXT NOT NULL,
  last_accessed_at TEXT NOT NULL
);
