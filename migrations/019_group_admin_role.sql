-- 019_group_admin_role.sql
-- Active le rôle d'administrateur de groupe. Jusqu'ici user_groups.role était stocké
-- et affiché mais n'ouvrait aucun droit : toute la gestion passait par users.role.
-- La colonne devient porteuse de droits, on la contraint donc au même titre que users.role.
--
-- Droits ouverts par role = 'admin' (voir src/lib/types.ts : canManageGroup) :
--   - gérer les membres de son groupe (en 'member' uniquement)
--   - renommer son groupe
--   - supprimer les sessions et les prises créées par d'autres membres
-- L'attribution du rôle reste exclusivement au superadmin (canAssignGroupAdmin).

UPDATE user_groups SET role = 'member' WHERE role NOT IN ('admin', 'member');

ALTER TABLE user_groups
    ADD CONSTRAINT user_groups_role_check CHECK (role IN ('admin', 'member'));
