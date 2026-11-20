CREATE TABLE github_snapshot (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    sponsors TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE kofi_activity (
    id TEXT PRIMARY KEY,
    occurred_at TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('support', 'purchase')),
    item TEXT,
    public_name TEXT,
    hidden INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX kofi_activity_recent ON kofi_activity (hidden, occurred_at DESC);
