-- Migration 047 : préférences de notification
--
-- Jusqu'ici, toute action prévient tous les membres du groupe, commentaires compris. Chacun
-- peut désormais choisir, groupe par groupe, ce qui lui parvient : on suit de près le groupe
-- où l'on joue chaque semaine, et de plus loin un autre.
--
-- Sur l'appartenance (user_groups), comme les instruments : les préférences d'un groupe
-- partent avec lui. Objet vide = tout, comme avant — une clé absente vaut sa valeur par
-- défaut (src/lib/notification-prefs.ts), donc rien n'est à réécrire pour les membres
-- existants. Les mentions ne se règlent pas : elles parviennent toujours.

ALTER TABLE user_groups
    ADD COLUMN notification_prefs JSONB NOT NULL DEFAULT '{}';
