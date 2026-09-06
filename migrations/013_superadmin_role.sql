-- 013_superadmin_role.sql
-- Introduit le rôle 'superadmin'. Le superadmin a tous les pouvoirs d'un admin, plus la
-- gestion exclusive des comptes admin/superadmin (voir src/lib/types.ts : isAdmin / isSuperadmin).

ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'admin', 'superadmin'));

-- Promotion du premier superadmin : compte "Maxime", seul admin existant.
UPDATE users SET role = 'superadmin' WHERE name = 'Maxime' AND role = 'admin';
