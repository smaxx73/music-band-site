-- Migration 034 : miniature du logo de groupe
--
-- Les logos deviennent publics (en attendant des pages publiques de groupe) : ils servent
-- d'image d'aperçu quand un lien d'écoute est collé dans WhatsApp, Messenger, Slack...
-- Un logo peut peser 2 Mo, et WhatsApp ignore les images d'aperçu trop lourdes (au-delà
-- d'environ 300 Ko). D'où une miniature JPEG carrée de quelques dizaines de Ko.
--
-- Fabriquée à la première demande puis gardée ici, à côté de l'original : elle suit le
-- groupe dans pg_dump et part avec lui. Remise à NULL quand le logo change.

ALTER TABLE group_logos ADD COLUMN thumbnail BYTEA;
