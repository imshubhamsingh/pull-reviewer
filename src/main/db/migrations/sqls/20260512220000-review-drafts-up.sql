CREATE TABLE review_drafts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  repo        TEXT NOT NULL,
  pr_number   INTEGER NOT NULL,
  file        TEXT NOT NULL,
  line        INTEGER NOT NULL,
  side        TEXT NOT NULL DEFAULT 'after',  -- 'before' | 'after'
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX idx_review_drafts_repo_pr ON review_drafts(repo, pr_number);
