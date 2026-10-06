-- Migration 048 : une prise neuve n'a pas de qualité
--
-- Jusqu'ici, toute prise naissait « À revoir » : la pastille ne disait rien, puisque
-- personne ne l'avait choisie, et « À revoir » ne se distinguait plus d'un vrai jugement.
-- Désormais NULL = pas encore évaluée, et « À revoir » redevient un choix.
--
-- Les « À revoir » existants sont vidés : presque tous viennent du défaut, et rien ne
-- distingue les rares qui ont été choisis exprès.

ALTER TABLE recordings ALTER COLUMN status DROP DEFAULT;
UPDATE recordings SET status = NULL WHERE status IN ('À revoir', 'en_cours');
