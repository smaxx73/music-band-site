-- Migration 042 : liens d'écoute publics recopiables
--
-- Jusqu'ici seule l'empreinte du jeton était gardée : un lien ne s'affichait qu'à sa
-- création, et le partager à une deuxième personne obligeait à en créer un autre.
--
-- Le jeton est désormais aussi gardé SCELLÉ (AES-256-GCM, clé dérivée d'AUTH_SECRET) :
-- l'application peut le relire pour le recopier, mais une sauvegarde `pg_dump` seule
-- ne publie toujours rien — sans le secret du serveur, la colonne est illisible.
-- La recherche d'un lien reste faite par `token_hash`.
--
-- Les liens créés avant cette migration n'ont pas de jeton scellé (NULL) : ils
-- continuent de fonctionner, mais ne se recopient pas. Les révoquer et en recréer un.

ALTER TABLE share_links ADD COLUMN token_sealed TEXT;
