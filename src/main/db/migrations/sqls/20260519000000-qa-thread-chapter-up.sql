ALTER TABLE qa_threads ADD COLUMN chapter_id TEXT NULL;
CREATE INDEX idx_qa_threads_repo_pr_chapter ON qa_threads(repo, pr_number, chapter_id);
