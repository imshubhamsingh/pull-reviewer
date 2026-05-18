-- AI review payload (per-tour) + per-finding dismissals.
ALTER TABLE tours ADD COLUMN review_json TEXT NULL;

CREATE TABLE ai_finding_dismissals (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  repo          TEXT NOT NULL,
  pr_number     INTEGER NOT NULL,
  head_ref_oid  TEXT NOT NULL,
  finding_id    TEXT NOT NULL,                                  -- stable id from the review payload
  dismissed_at  TEXT NOT NULL,
  UNIQUE(repo, pr_number, head_ref_oid, finding_id)
);

CREATE INDEX idx_ai_finding_dismissals_pr_sha
  ON ai_finding_dismissals(repo, pr_number, head_ref_oid);
