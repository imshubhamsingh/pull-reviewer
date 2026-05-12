CREATE TABLE qa_threads (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  repo        TEXT NOT NULL,
  pr_number   INTEGER NOT NULL,
  file        TEXT NOT NULL,
  start_line  INTEGER NOT NULL,
  end_line    INTEGER NOT NULL,
  question    TEXT NOT NULL,
  answer      TEXT NOT NULL,
  model       TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_qa_threads_repo_pr ON qa_threads(repo, pr_number);
CREATE INDEX idx_qa_threads_repo_pr_file ON qa_threads(repo, pr_number, file);
