-- Amélioration du son d'une prise (coupe-bas, égalisation, compression, loudness, limiteur).
-- Proposée après analyse, appliquée à la demande et réversible : l'original reste à côté
-- du fichier amélioré, dans AUDIO_DIR/{id}.original.mp3 — voir src/lib/server/audio-enhance.ts.
BEGIN;

ALTER TABLE recordings
    -- Mesures de l'original (loudness, plage, crête vraie, équilibre aigus / grave),
    -- calculées à la première demande puis gardées : elles disent s'il y a lieu de
    -- proposer l'amélioration, et avec quels réglages.
    ADD COLUMN audio_analysis      JSONB,
    -- NULL = le fichier servi est l'original. Renseigné, {id}.mp3 est la version
    -- améliorée et {id}.original.mp3 l'original, à rétablir à la demande.
    ADD COLUMN enhanced_at         TIMESTAMPTZ,
    ADD COLUMN enhanced_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    -- Réglages choisis pour cette prise ({ eq: 'none'|'soft'|'full', compression }) :
    -- ceux du module, ou ceux que l'oreille a préférés.
    ADD COLUMN enhancement         JSONB;

COMMIT;
