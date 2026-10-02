-- La feuille de répétition d'un morceau appartient au groupe, pas à celui qui l'a
-- commencée : supprimer son compte ne doit plus l'effacer pour tout le groupe.
-- `user_id` devient l'auteur (NULL quand le compte a disparu, comme ailleurs).
-- Une feuille libre (song_id NULL) reste personnelle : la suppression du compte
-- l'efface explicitement (src/routes/admin/users/+page.server.ts).
BEGIN;

ALTER TABLE score_documents ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE score_documents DROP CONSTRAINT score_documents_user_id_fkey;
ALTER TABLE score_documents
    ADD CONSTRAINT score_documents_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

COMMIT;
