-- 013_superadmin_role.sql
-- Introduit le rôle 'superadmin'. Le superadmin a tous les pouvoirs d'un admin, plus la
-- gestion exclusive des comptes admin/superadmin (voir src/lib/types.ts : isAdmin / isSuperadmin).
--
-- Schéma uniquement — la promotion du premier superadmin est spécifique à chaque
-- environnement (nom de compte différent en dev/prod) et se fait à part, ex :
--   UPDATE users SET role = 'superadmin' WHERE name = '<votre compte>';

ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'admin', 'superadmin'));
