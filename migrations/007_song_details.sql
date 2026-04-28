-- Migration 007 : paroles et informations musicales des morceaux

ALTER TABLE songs ADD COLUMN lyrics TEXT;
ALTER TABLE songs ADD COLUMN music_notes TEXT;
