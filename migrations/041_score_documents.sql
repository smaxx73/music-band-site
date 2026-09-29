-- Feuilles de répétition privées des administrateurs. Le manifeste garde l'ordre
-- des blocs ; les sources et les originaux sont conservés séparément.
CREATE TABLE score_documents (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    song_id INTEGER UNIQUE REFERENCES songs(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    manifest JSONB NOT NULL DEFAULT '[]'::jsonb,
    contents JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE score_originals (
    document_id INTEGER NOT NULL REFERENCES score_documents(id) ON DELETE CASCADE,
    block_id INTEGER NOT NULL,
    file_name TEXT NOT NULL,
    format TEXT NOT NULL CHECK (format IN ('musicxml', 'mxl')),
    warning TEXT,
    content BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (document_id, block_id)
);

CREATE INDEX idx_score_documents_user ON score_documents(user_id, updated_at DESC);
