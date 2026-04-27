CREATE TABLE calendar_events (
    id          SERIAL PRIMARY KEY,
    group_id    INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    date        DATE NOT NULL,
    type        TEXT NOT NULL CHECK (type IN ('indisponibilite', 'repetition', 'concert')),
    author      TEXT NOT NULL,
    title       TEXT,
    notes       TEXT,
    session_id  INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_calendar_events_group_date ON calendar_events(group_id, date);
