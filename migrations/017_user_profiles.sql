-- Le champ historique `name` devient l'identifiant de connexion : le pseudo.
-- Les comptes existants conservent donc leur accès et leur nom affiché actuel.
ALTER TABLE users RENAME COLUMN name TO nickname;

ALTER TABLE users
    ADD COLUMN first_name TEXT,
    ADD COLUMN last_name TEXT,
    ADD COLUMN display_name_format TEXT NOT NULL DEFAULT 'nickname'
        CHECK (display_name_format IN ('nickname', 'first_name', 'first_name_last_initial', 'first_name_last_name')),
    ADD COLUMN display_name TEXT GENERATED ALWAYS AS (
        CASE
            WHEN display_name_format = 'first_name'
                AND NULLIF(btrim(first_name), '') IS NOT NULL
                THEN btrim(first_name)
            WHEN display_name_format = 'first_name_last_initial'
                AND NULLIF(btrim(first_name), '') IS NOT NULL
                AND NULLIF(btrim(last_name), '') IS NOT NULL
                THEN btrim(first_name) || ' ' || left(btrim(last_name), 1) || '.'
            WHEN display_name_format = 'first_name_last_name'
                AND NULLIF(btrim(first_name), '') IS NOT NULL
                AND NULLIF(btrim(last_name), '') IS NOT NULL
                THEN btrim(first_name) || ' ' || btrim(last_name)
            ELSE nickname
        END
    ) STORED;
