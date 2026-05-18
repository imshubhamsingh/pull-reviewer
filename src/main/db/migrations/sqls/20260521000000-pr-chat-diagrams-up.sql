-- Nullable JSON array of Diagram objects emitted by the chat assistant
-- alongside its markdown answer. NULL on user messages and on assistant
-- messages that didn't include any diagram (the common case).
ALTER TABLE pr_chat_messages ADD COLUMN diagrams_json TEXT;
