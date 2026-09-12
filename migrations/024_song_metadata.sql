-- Migration 024 : métadonnées complémentaires des morceaux
-- (année de sortie, artiste/groupe original, durée de référence)

ALTER TABLE songs ADD COLUMN release_year INTEGER;
ALTER TABLE songs ADD COLUMN original_artist TEXT;
ALTER TABLE songs ADD COLUMN reference_duration_s INTEGER;
