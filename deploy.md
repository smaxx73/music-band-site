# Déploiement sur le VPS

> Prérequis : Caddy et Docker installés sur le VPS, `vps-rockandmore` déployé (voir `../deploy.md`).

## Première mise en prod

```bash
# Sur le VPS
git clone <url-repo> ~/music-band-site
cd ~/music-band-site

cp .env.example .env
nano .env   # remplir AUTH_SECRET, POSTGRES_PASSWORD, PUBLIC_SHARE_ORIGIN
chmod 600 .env

docker compose up -d --build
```

Générer la valeur de `AUTH_SECRET` avec `openssl rand -hex 32`. L'application
refuse les valeurs modèle ou les secrets de moins de 32 caractères.

## Mises à jour

```bash
# Sur le VPS
cd ~/music-band-site
git pull
docker compose up -d --build app
```

## Publier une version

La version vit dans `package.json` (affichée sous le nom du site, en haut à gauche). Choisir le
niveau selon les règles en tête de `CHANGELOG.md`.

1. Dans `CHANGELOG.md`, renommer « [Non publié] » en « [X.Y.Z] — AAAA-MM-JJ », avec les
   migrations apportées, et rouvrir une section « [Non publié] » vide
2. Changer `"version"` dans `package.json`
3. Commiter et pousser comme d'habitude

Sur le VPS, la mise à jour reste celle ci-dessus.

## Appliquer une migration

```bash
docker compose exec -T db psql -U band -d bandapp < migrations/XXX_nom.sql
```

## Commandes utiles

```bash
docker compose logs -f app          # logs de l'app
docker compose logs -f db           # logs postgres
docker ps                           # état des containers
docker compose exec db psql -U band -d bandapp   # accès BDD

# Fichiers audio dont un seul canal porte le son : lister, puis corriger.
# La sauvegarde est hors volume : la rapatrier sur l'hôte avant de recréer le conteneur.
docker compose exec app node scripts/fix-single-channel.mjs
docker compose exec app node scripts/fix-single-channel.mjs --apply --backup=/tmp/mono-backup
docker compose cp app:/tmp/mono-backup ./mono-backup
```

## Architecture

```
Internet → Caddy système (80/443) → localhost:3000 → container app → container db
```

- Caddy gère le HTTPS et proxifie vers le port 3000
- L'app et la DB communiquent sur le réseau Docker interne
- Les fichiers audio sont dans le volume Docker `audio_data` et sont servis par
  l'application après contrôle de la session et du groupe actif. Caddy doit proxyfier
  `/audio/*` vers l'application, sans règle `file_server` publique pour ce chemin.
- `/ecoute/*` (liens d'écoute publics) est proxyfié comme le reste : le jeton y est
  vérifié par l'application. Il figure dans l'URL, donc dans les journaux d'accès de Caddy —
  les garder courts (voir `accessLogRetentionDays` dans `src/lib/legal.ts`).

## Domaine dédié aux liens publics

Les membres utilisent `music.maximenguyen.fr` ; les liens d'écoute diffusés au grand public
vivent sur un second domaine, qui ne sert **que** le public.

- `PUBLIC_SHARE_ORIGIN` (`.env`, ex. `https://music.rockandmore.org`) : domaine inscrit dans les
  liens copiés, quel que soit le domaine d'où le membre les copie. Lu au démarrage, sans
  rebuild : `docker compose up -d` suffit. Vide, le lien reprend le domaine courant
- Pas de variable `ORIGIN` : elle forcerait `url.origin` sur un seul domaine, et l'aperçu
  du lien (Open Graph) pointerait vers le mauvais. L'origine vient de `x-forwarded-proto` et
  `x-forwarded-host`, posés par Caddy ; le port 3000 n'est ouvert qu'en local, donc ces
  en-têtes ne viennent que de lui
- Caddy (`vps-rockandmore/Caddyfile`) n'ouvre sur le domaine public que `/ecoute/*`
  (page et fichier audio), `/_app/*`, `/brand/*`, `/robots.txt` et le logo du groupe
  (`/api/groups/*/logo`, image d'aperçu). Tout le reste répond `404` : ni connexion, ni API
- Les liens déjà envoyés sur l'ancien domaine restent valables : le jeton ne dépend pas du domaine
- Les cookies de session restent propres au domaine des membres ; le domaine public n'en pose aucun
