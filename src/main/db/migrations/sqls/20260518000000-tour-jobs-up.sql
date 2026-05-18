-- Background tour-generation jobs. Keyed by (repo, pr, head_ref_oid)
-- so new commits on the same PR create new jobs without colliding.
CREATE TABLE tour_jobs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  repo          TEXT NOT NULL,
  pr_number     INTEGER NOT NULL,
  head_ref_oid  TEXT NOT NULL,
  status        TEXT NOT NULL,                                  -- 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  started_at    TEXT NULL,
  finished_at   TEXT NULL,
  error         TEXT NULL,
  UNIQUE(repo, pr_number, head_ref_oid, started_at)
);

-- Latest-job-per-(repo, pr, head) is the hot path (active job lookup, retry hint).
CREATE INDEX idx_tour_jobs_pr_sha    ON tour_jobs(repo, pr_number, head_ref_oid, started_at DESC);
-- Active-jobs scan across all PRs (PR list spinner + header pill).
CREATE INDEX idx_tour_jobs_status    ON tour_jobs(status);
-- "Latest commit per PR" UI queries (when head SHA changes since last job).
CREATE INDEX idx_tour_jobs_pr_latest ON tour_jobs(repo, pr_number, started_at DESC);
