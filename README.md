# Band Rehearsal App

Application web privée pour partager et archiver les enregistrements de répétitions d'un groupe de musique. Accès restreint par mot de passe partagé — tous les membres ont les mêmes droits.

## Fonctionnalités

### Enregistrements

- **Upload** de fichiers audio (jusqu'à 200 Mo) avec conversion automatique en MP3 128 kbps via ffmpeg et suppression des silences en début/fin
- **Numérotation automatique des prises** par morceau et par session (Prise 1, 2, 3…)
- **Lecteur audio** avec visualisation de la forme d'onde (WaveSurfer.js), contrôles ⏮ ▶/⏸ ⏭ +10s et réglage du volume
- **Statut par prise** : En cours / Au point / Répertoire — modifiable directement dans la vue session

### Sessions

- Création de sessions (date, lieu, membres présents, notes)
- Vue session : prises groupées par morceau, statut et notes éditables inline
- Ajout de prises à une session passée

### Morceaux

- Référentiel de morceaux avec titre, compositeur, tonalité et statut (En apprentissage / Au répertoire / Abandonné)
- Historique complet d'un morceau : toutes ses prises toutes sessions confondues, triées par date décroissante

### Commentaires

- Commentaires globaux ou ancrés à un timestamp précis sur la waveform
- Marqueurs cliquables sur la waveform → seek + scroll vers le commentaire

### Playlists

- Création de playlists de prises spécifiques
- Lecture en continu avec enchaînement automatique
- Réorganisation par drag & drop
- Ajout d'une prise à une playlist depuis le lecteur

### Tableau de bord

- 5 dernières sessions avec résumé des morceaux travaillés
- Playlists triées par dernière modification

---

## Tester en local

### Prérequis locaux

- [Node.js 22+](https://nodejs.org)
- [pnpm](https://pnpm.io) — `npm install -g pnpm`
- [Docker](https://www.docker.com) et Docker Compose
- [ffmpeg](https://ffmpeg.org) installé sur la machine

### 1. Cloner et installer

```bash
git clone <url-du-repo>
cd music-band-site
pnpm install
```

### 2. Créer le fichier `.env`

```bash
nano .env
```

Contenu minimal pour le dev local :

```env
DATABASE_URL=postgresql://band:secret@localhost:5432/bandapp
AUDIO_DIR=/tmp/audio-dev
AUTH_PASSWORD=motdepasse
AUTH_SECRET=une_chaine_aleatoire_longue
NODE_ENV=development
```

Créer le dossier audio local :

```bash
mkdir -p /tmp/audio-dev
```

### 3. Démarrer la base de données

```bash
docker compose up db -d
```

La base est initialisée automatiquement via les fichiers `migrations/` au premier démarrage.

### 4. Lancer le serveur de développement

```bash
pnpm dev
```

L'application est disponible sur [http://localhost:5173](http://localhost:5173).

> En dev, les fichiers audio sont servis directement par Node (route `/audio/[id]`). En production, c'est Caddy qui les sert.

---

## Déployer sur un VPS

### Prérequis sur le VPS

- Docker et Docker Compose installés
- Un nom de domaine pointant sur l'IP du VPS (nécessaire pour le HTTPS automatique de Caddy)
- Ports 80 et 443 ouverts

### 1. Transférer les fichiers

```bash
# Depuis la machine locale
rsync -av --exclude node_modules --exclude .git . user@vps:/opt/band-app/
```

Ou cloner directement sur le VPS :

```bash
git clone <url-du-repo> /opt/band-app
cd /opt/band-app
```

### 2. Configurer le fichier `.env`

Sur le VPS, dans `/opt/band-app/` :

```bash
nano .env
```

```env
# Domaine public (sans https://)
DOMAIN=rehearsal.mongroupe.fr

# Mot de passe d'accès à l'application
AUTH_PASSWORD=motdepassedugroupe

# Clé secrète pour les cookies — générer avec : openssl rand -hex 32
AUTH_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# URL d'origine pour SvelteKit (avec https://)
ORIGIN=https://rehearsal.mongroupe.fr
```

> Les variables `DATABASE_URL` et `AUDIO_DIR` sont câblées directement dans `docker-compose.yml` et n'ont pas besoin d'être dans `.env`.

### 3. Premier démarrage

```bash
cd /opt/band-app
docker compose up -d --build
```

La stack démarre dans cet ordre :

1. **db** — PostgreSQL 16, initialise le schéma via `migrations/`
2. **app** — SvelteKit buildé, attend que la base soit prête
3. **caddy** — reverse proxy, obtient un certificat TLS automatiquement via Let's Encrypt

Vérifier que tout est lancé :

```bash
docker compose ps
docker compose logs -f
```

### 4. Mises à jour

```bash
cd /opt/band-app
git pull
docker compose up -d --build app
```

Seul le conteneur `app` est reconstruit. La base de données et les fichiers audio ne sont pas affectés (volumes persistants).

### 5. Migrations de schéma

Les fichiers `migrations/` sont appliqués automatiquement au **premier démarrage** de la base (quand le volume est vide). Pour appliquer une migration sur une base existante, l'exécuter manuellement :

```bash
docker compose exec db psql -U band -d bandapp \
  -f /docker-entrypoint-initdb.d/002_playlists_updated_at.sql
```

### 6. Commandes utiles

```bash
# Logs en temps réel
docker compose logs -f app

# Accès à la base de données
docker compose exec db psql -U band -d bandapp

# Sauvegarder la base
docker compose exec db pg_dump -U band bandapp > backup_$(date +%Y%m%d).sql

# Restaurer une sauvegarde
docker compose exec -T db psql -U band -d bandapp < backup_20240101.sql

# Lister les fichiers audio stockés
docker compose exec app ls /data/audio
```

### Architecture de production

```text
Internet → Caddy (:80/:443)
              │
              ├─ /audio/*  →  fichiers MP3 (volume Docker, servi statiquement)
              └─ /*        →  app:3000 (SvelteKit / Node)
                                │
                                └─ db:5432 (PostgreSQL)
```

Les fichiers audio ne transitent jamais par Node en production : Caddy les sert directement depuis le volume `audio_data`, ce qui évite de les charger en mémoire.
