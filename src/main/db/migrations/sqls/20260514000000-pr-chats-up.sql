CREATE TABLE pr_chats (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  repo        TEXT NOT NULL,
  pr_number   INTEGER NOT NULL,
  title       TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX idx_pr_chats_repo_pr ON pr_chats(repo, pr_number, updated_at DESC);

CREATE TABLE pr_chat_messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id         INTEGER NOT NULL REFERENCES pr_chats(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  body            TEXT NOT NULL,
  references_json TEXT,                                       -- JSON array of {file, lineStart, lineEnd?} for assistant; null otherwise
  status          TEXT NOT NULL DEFAULT 'complete' CHECK (status IN ('streaming', 'complete', 'interrupted', 'error')),
  model           TEXT,
  created_at      TEXT NOT NULL
);
CREATE INDEX idx_pr_chat_messages_chat ON pr_chat_messages(chat_id, id);
