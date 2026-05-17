-- Remplace les valeurs de statut de prise (en_cours/au_point/repertoire)
-- par des libellés de qualité lisibles et libres.
UPDATE recordings SET status = 'À revoir' WHERE status = 'en_cours';
UPDATE recordings SET status = 'Bon'      WHERE status = 'au_point';
UPDATE recordings SET status = 'Référence' WHERE status = 'repertoire';
ALTER TABLE recordings ALTER COLUMN status SET DEFAULT 'À revoir';
