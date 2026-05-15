CREATE TABLE pr_recents (
  repo            TEXT NOT NULL,
  pr_number       INTEGER NOT NULL,
  pr_id           TEXT NOT NULL,                                -- GraphQL node id; lets us link back to GitHub later
  title           TEXT NOT NULL,
  url             TEXT NOT NULL,
  author          TEXT NOT NULL,
  is_draft        INTEGER NOT NULL,                             -- 0 | 1
  state           TEXT NOT NULL,                                -- 'OPEN' | 'CLOSED' | 'MERGED'
  pr_created_at   TEXT NOT NULL,
  pr_updated_at   TEXT NOT NULL,
  additions       INTEGER NOT NULL,
  deletions       INTEGER NOT NULL,
  changed_files   INTEGER NOT NULL,
  review_decision TEXT,                                          -- 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null
  last_opened_at  TEXT NOT NULL,
  PRIMARY KEY (repo, pr_number)
);
CREATE INDEX idx_pr_recents_last_opened ON pr_recents(last_opened_at DESC);
