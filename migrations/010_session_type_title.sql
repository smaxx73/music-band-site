ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS type  TEXT NOT NULL DEFAULT 'repetition',
  ADD COLUMN IF NOT EXISTS title TEXT;

-- repetition | concert | studio | autre
