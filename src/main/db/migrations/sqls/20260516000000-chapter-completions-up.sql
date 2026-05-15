CREATE TABLE chapter_completions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  repo          TEXT NOT NULL,
  pr_number     INTEGER NOT NULL,
  head_ref_oid  TEXT NOT NULL,
  chapter_id    TEXT NOT NULL,                                  -- LLM-generated, stable within a single (repo, pr, head_sha) snapshot
  completed_at  TEXT NOT NULL,
  UNIQUE(repo, pr_number, head_ref_oid, chapter_id)
);
CREATE INDEX idx_chapter_completions_pr_sha
  ON chapter_completions(repo, pr_number, head_ref_oid);
