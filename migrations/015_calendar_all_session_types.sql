-- 015_calendar_all_session_types.sql
-- Toute session apparaît dans l'agenda, quel que soit son type.
-- Jusqu'ici seules les répétitions et les concerts y étaient reflétés ;
-- studio et autre étaient rejetés par la contrainte de type.

ALTER TABLE calendar_events DROP CONSTRAINT IF EXISTS calendar_events_type_check;

ALTER TABLE calendar_events ADD CONSTRAINT calendar_events_type_check
    CHECK (type IN ('indisponibilite', 'repetition', 'concert', 'studio', 'autre'));

-- Rattraper les sessions sans événement d'agenda (studio/autre existantes)
INSERT INTO calendar_events (group_id, user_id, date, type, author, title, notes, location, session_id)
SELECT s.group_id, NULL, s.date, s.type, s.created_by, s.title, s.notes, s.location, s.id
FROM sessions s
WHERE NOT EXISTS (
    SELECT 1 FROM calendar_events e WHERE e.session_id = s.id
);
