-- Les prises sont numérotées sur toute la vie d'un morceau, pas à l'intérieur
-- d'une session. Les données existantes sont remises dans l'ordre chronologique
-- (date de session, date de création, puis id pour départager les égalités).

BEGIN;

ALTER TABLE recordings DROP CONSTRAINT recordings_session_id_song_id_take_key;

WITH numbered AS (
	SELECT
		r.id,
		ROW_NUMBER() OVER (
			PARTITION BY r.song_id
			ORDER BY ses.date ASC, r.created_at ASC, r.id ASC
		) AS global_take
	FROM recordings r
	JOIN sessions ses ON ses.id = r.session_id
)
UPDATE recordings r
SET take = numbered.global_take
FROM numbered
WHERE r.id = numbered.id;

ALTER TABLE recordings
	ADD CONSTRAINT recordings_song_id_take_key UNIQUE (song_id, take);

COMMIT;
