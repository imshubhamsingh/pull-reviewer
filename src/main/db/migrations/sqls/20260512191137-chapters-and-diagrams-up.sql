-- Phase 4: add the chapters-shaped tour payload.
-- Old `steps_json` column stays for one release as a soft fallback; rows whose
-- schema_version < 2 are treated as stale and regenerated on next access.

ALTER TABLE tours ADD COLUMN chapters_json   TEXT;
ALTER TABLE tours ADD COLUMN schema_version  INTEGER NOT NULL DEFAULT 1;
