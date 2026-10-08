-- Tempo de référence d'un morceau, en battements par minute : la feuille de répétition
-- en tire un clic (métronome). NULL = pas renseigné, pas de clic proposé.
-- Borné à ce qu'un métronome joue utilement : en deçà ou au-delà, c'est une faute de frappe.
BEGIN;

ALTER TABLE songs
    ADD COLUMN tempo_bpm INTEGER CHECK (tempo_bpm BETWEEN 20 AND 300);

COMMIT;
