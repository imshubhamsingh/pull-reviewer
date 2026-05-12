-- Phase 5 add-on: capture cost + usage for each generation so the UI can
-- show "this tour cost $X (Y tokens)" and the user can budget over time.
-- All three are nullable — codex (and any future provider that doesn't
-- expose costs) just leaves them null.

ALTER TABLE tours ADD COLUMN cost_usd     REAL;
ALTER TABLE tours ADD COLUMN duration_ms  INTEGER;
ALTER TABLE tours ADD COLUMN usage_json   TEXT;
