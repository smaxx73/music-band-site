ALTER TABLE recordings ADD COLUMN IF NOT EXISTS file_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_recordings_file_hash ON recordings(file_hash);
