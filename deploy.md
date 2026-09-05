# Déploiement sur le VPS

> Prérequis : Caddy et Docker installés sur le VPS, `vps-rockandmore` déployé (voir `../deploy.md`).

## Première mise en prod

```bash
# Sur le VPS
git clone <url-repo> ~/music-band-site
cd ~/music-band-site

cp .env.example .env
nano .env   # remplir AUTH_SECRET, POSTGRES_PASSWORD, ORIGIN=https://maximenguyen.fr
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
