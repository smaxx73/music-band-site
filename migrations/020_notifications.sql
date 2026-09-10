-- 020_notifications.sql
-- Notifications d'activité du groupe.
--
-- Une ligne par destinataire (fan-out à l'écriture) plutôt qu'un événement partagé
-- avec un filigrane de lecture : c'est ce qui permet les actions habituelles du menu
-- — marquer une notification lue, la remettre en non lue, tout marquer comme lu —
-- qui exigent un état de lecture par membre et par événement.
--
-- L'auteur d'une action n'est jamais notifié de sa propre action (voir
-- src/lib/server/notifications.ts).

CREATE TABLE notifications (
    id            SERIAL PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,   -- destinataire
    group_id      INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    type          TEXT NOT NULL CHECK (type IN ('recording', 'comment', 'session', 'playlist', 'agenda')),
    actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                                                 -- auteur de l'action ; le nom affiché est relu
                                                 -- depuis users pour suivre les changements de profil
    actor_name    TEXT NOT NULL,                 -- repli si le compte a disparu
    subject       TEXT,                          -- morceau, nom de playlist, titre de session…
    excerpt       TEXT,                          -- extrait (commentaire, notes) tronqué à l'écriture
    link          TEXT NOT NULL,                 -- cible dans l'application
    -- Références nullables : une notification disparaît avec le contenu qu'elle annonce
    -- plutôt que de pointer vers une page supprimée.
    session_id    INTEGER REFERENCES sessions(id)   ON DELETE CASCADE,
    recording_id  INTEGER REFERENCES recordings(id) ON DELETE CASCADE,
    playlist_id   INTEGER REFERENCES playlists(id)  ON DELETE CASCADE,
    read_at       TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_recipient ON notifications(user_id, group_id, created_at DESC);
CREATE INDEX idx_notifications_unread    ON notifications(user_id, group_id) WHERE read_at IS NULL;
