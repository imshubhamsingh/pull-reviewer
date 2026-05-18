-- Stable claude session uuid per chat + a flag that flips to 1 after the
-- first successful turn lands. The ChatProcessManager spawns with
-- `--session-id <uuid>` when started=0 (creates the server-side session) and
-- with `--resume <uuid>` when started=1 (resumes the existing one). Surviving
-- across app restarts lets the user pick up a chat exactly where they left
-- it without us replaying the conversation history every turn.
ALTER TABLE pr_chats ADD COLUMN session_uuid TEXT;
ALTER TABLE pr_chats ADD COLUMN session_started INTEGER NOT NULL DEFAULT 0;
