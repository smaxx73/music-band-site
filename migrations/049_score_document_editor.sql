-- Qui a enregistré une feuille de répétition en dernier : tout membre du groupe la
-- modifie, et la date seule ne dit pas à qui demander ce qui a changé.
-- Les feuilles existantes restent à NULL : l'auteur (`user_id`) n'est pas forcément
-- le dernier à l'avoir modifiée, et l'écran n'affiche alors que la date.
BEGIN;

ALTER TABLE score_documents
    ADD COLUMN updated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

COMMIT;
