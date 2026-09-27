-- Migration 039 : lieux du groupe, et adresse du lieu d'une session
--
-- Le lieu d'une session ou d'un événement d'agenda reste un texte libre (`location`),
-- affiché partout. À la saisie, il se choisit désormais :
--   - parmi les LIEUX DU GROUPE (`group_places`) : une étiquette (« Chez Élise ») et, si
--     on la connaît, son adresse. La liste se gère depuis /group, par les admins du
--     groupe. La session porte l'étiquette ; l'adresse se relit dans `group_places`,
--     donc la corriger une fois la corrige partout ;
--   - ou comme une ADRESSE réelle ponctuelle, cherchée dans la Base Adresse Nationale :
--     la session porte l'adresse en toutes lettres, et ses coordonnées
--     (`location_lat`, `location_lon`) pour le lien vers la carte.
--
-- Une étiquette se compare sans casse ni espaces de bord. Renommer un lieu du groupe
-- réécrit le texte des sessions et événements qui le portaient.

CREATE TABLE group_places (
    id                  SERIAL PRIMARY KEY,
    group_id            INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    label               TEXT NOT NULL,              -- l'étiquette, ce que portent les sessions
    address             TEXT,                       -- NULL : adresse pas encore renseignée
    latitude            DOUBLE PRECISION,           -- NULL : adresse saisie à la main, pas de carte
    longitude           DOUBLE PRECISION,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ,
    CONSTRAINT group_places_coords CHECK ((latitude IS NULL) = (longitude IS NULL)),
    CONSTRAINT group_places_coords_address CHECK (latitude IS NULL OR address IS NOT NULL)
);

CREATE UNIQUE INDEX group_places_label ON group_places (group_id, lower(btrim(label)));

ALTER TABLE sessions
    ADD COLUMN location_lat DOUBLE PRECISION,
    ADD COLUMN location_lon DOUBLE PRECISION,
    ADD CONSTRAINT sessions_location_coords CHECK ((location_lat IS NULL) = (location_lon IS NULL));

ALTER TABLE calendar_events
    ADD COLUMN location_lat DOUBLE PRECISION,
    ADD COLUMN location_lon DOUBLE PRECISION,
    ADD CONSTRAINT calendar_events_location_coords CHECK ((location_lat IS NULL) = (location_lon IS NULL));

-- Amorce : un lieu employé au moins deux fois dans un groupe en devient un lieu, sans
-- adresse, sous sa forme la plus récente. Un lieu employé une seule fois reste un simple
-- texte. La liste se trie ensuite depuis /group.
INSERT INTO group_places (group_id, label)
SELECT group_id, (array_agg(btrim(location) ORDER BY date DESC))[1]
FROM (
    SELECT group_id, location, date FROM sessions
    UNION ALL
    -- L'événement d'une session reprend son lieu : ne compter que la session.
    SELECT group_id, location, date FROM calendar_events
    WHERE group_id IS NOT NULL AND session_id IS NULL AND type <> 'indisponibilite'
) used
WHERE location IS NOT NULL AND btrim(location) <> ''
GROUP BY group_id, lower(btrim(location))
HAVING COUNT(*) >= 2;
