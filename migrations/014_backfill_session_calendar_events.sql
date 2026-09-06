-- 014_backfill_session_calendar_events.sql
-- Les sessions de type répétition/concert créées avant l'auto-création de leur
-- événement d'agenda (POST /api/sessions) n'ont pas de calendar_events lié.
-- On les rattrape ici ; les créations à venir passent par l'API.

INSERT INTO calendar_events (group_id, user_id, date, type, author, title, notes, location, session_id)
SELECT s.group_id, NULL, s.date, s.type, s.created_by, s.title, s.notes, s.location, s.id
FROM sessions s
WHERE s.type IN ('repetition', 'concert')
  AND NOT EXISTS (
      SELECT 1 FROM calendar_events e WHERE e.session_id = s.id
  );
