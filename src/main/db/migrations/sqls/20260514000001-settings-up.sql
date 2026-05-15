CREATE TABLE settings (
  key        TEXT PRIMARY KEY,                                  -- dotted identifier, e.g. 'chat.history.budget'
  value      TEXT NOT NULL,                                     -- JSON-encoded value (string | number | boolean | null | object | array)
  updated_at TEXT NOT NULL                                      -- ISO-8601 timestamp of the last write
);
