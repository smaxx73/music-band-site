-- Téléchargement d'un lien d'écoute public : un choix à la création du lien. Le contenu
-- est protégé (droit d'auteur, droits voisins) : par défaut, l'écoute en ligne seulement.
-- Les liens existants passent eux aussi à « écoute seule » ; pour rouvrir le téléchargement,
-- il faut créer un nouveau lien en le cochant.
BEGIN;

ALTER TABLE share_links
    ADD COLUMN allow_download BOOLEAN NOT NULL DEFAULT false;

COMMIT;
