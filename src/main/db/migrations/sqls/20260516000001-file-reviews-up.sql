CREATE TABLE file_reviews (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  repo          TEXT NOT NULL,
  pr_number     INTEGER NOT NULL,
  head_ref_oid  TEXT NOT NULL,
  file_path     TEXT NOT NULL,                                  -- diff-relative path (matches PrFile.path)
  reviewed_at   TEXT NOT NULL,
  UNIQUE(repo, pr_number, head_ref_oid, file_path)
);
CREATE INDEX idx_file_reviews_pr_sha
  ON file_reviews(repo, pr_number, head_ref_oid);
