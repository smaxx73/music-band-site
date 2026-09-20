-- Migration 029 : setlists
--
-- Une setlist est un programme : l'ordre dans lequel le groupe jouera ses morceaux.
-- Elle pointe vers le référentiel (`songs`), pas vers des prises — on ne programme pas
-- un enregistrement du 12 mars, on programme un morceau. C'est ce qui la distingue
-- d'une playlist, qui vise des `recordings` précis pour les réécouter.
--
-- Le temps total n'est pas stocké : il se somme à la lecture depuis
-- `songs.reference_duration_s`. Le stocker obligerait à le recalculer à chaque
-- changement de durée de référence, et il serait faux entre-temps.

CREATE TABLE setlists (
    id          SERIAL PRIMARY KEY,
    group_id    INTEGER NOT NULL REFERENCES groups(id),
    name        TEXT NOT NULL,
    description TEXT,
    created_by  TEXT NOT NULL,
    created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ
);

-- Un morceau ne figure qu'une fois dans une setlist : le programme d'un concert
-- ne rejoue pas le même titre, et l'unicité rend l'écran d'ajout lisible (« déjà
-- dans la setlist »). Si un jour un rappel l'exige, c'est cette contrainte qui saute.
CREATE TABLE setlist_items (
    id          SERIAL PRIMARY KEY,
    setlist_id  INTEGER NOT NULL REFERENCES setlists(id) ON DELETE CASCADE,
    song_id     INTEGER NOT NULL REFERENCES songs(id)    ON DELETE CASCADE,
                                             -- un morceau supprimé du référentiel quitte
                                             -- les setlists : /songs interdit déjà la
                                             -- suppression dès qu'une prise existe
    position    INTEGER NOT NULL,            -- ordre dans le programme, réécrit en bloc
    UNIQUE (setlist_id, position),
    UNIQUE (setlist_id, song_id)
);

-- Les commentaires servaient une seule cible (une prise). Une setlist se discute de la
-- même façon — « on inverse 3 et 4 ? » —, avec les mêmes réactions, mentions et édition :
-- généraliser la table vaut mieux qu'en dupliquer une seconde avec ses réactions.
-- `recording_id` était déjà nullable ; la contrainte impose désormais une cible et une seule.
ALTER TABLE comments ADD COLUMN setlist_id INTEGER REFERENCES setlists(id) ON DELETE CASCADE;
ALTER TABLE comments ADD CONSTRAINT comments_target
    CHECK (num_nonnulls(recording_id, setlist_id) = 1);

-- Un commentaire de setlist n'a pas de repère de lecture : timestamp_s y reste NULL.

ALTER TABLE notifications ADD COLUMN setlist_id INTEGER REFERENCES setlists(id) ON DELETE CASCADE;
ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN ('recording', 'comment', 'mention', 'session', 'playlist', 'agenda', 'setlist'));

CREATE INDEX idx_setlists_group_id     ON setlists(group_id);
CREATE INDEX idx_setlist_items_setlist ON setlist_items(setlist_id, position);
CREATE INDEX idx_comments_setlist      ON comments(setlist_id) WHERE setlist_id IS NOT NULL;
