# BandStash

Application web privée pour partager et archiver les enregistrements de répétitions d'un groupe de musique. Accès restreint par compte individuel — deux rôles : **admin** (gestion des morceaux et des utilisateurs) et **utilisateur** (accès complet au contenu).

## Fonctionnalités

### Enregistrements

- **Upload** de fichiers audio (jusqu'à 200 Mo) avec conversion automatique en MP3 128 kbps via ffmpeg et suppression des silences en début/fin
- Détection des doublons par empreinte SHA-256 avant conversion
- **Numérotation automatique des prises** par morceau et par session (Prise 1, 2, 3…)
- **Lecteur audio** avec visualisation de la forme d'onde (WaveSurfer.js), contrôles ⏮ ▶/⏸ ⏭ +10s et réglage du volume
- **Qualité par prise** : À revoir / Moyen / Bon / Référence ou libellé court personnalisé — se règle uniquement dans le détail d'une session

### Sessions

- Création de sessions avec type (répétition, concert, studio, autre), titre optionnel, date, lieu, membres présents et notes
- Vue session : prises groupées par morceau, qualité et notes éditables inline ; l'historique d'un morceau est en lecture seule
- Ajout de prises à une session passée
- Mode édition pour supprimer des prises, réordonner les prises d'un morceau et renuméroter
- Suppression d'une session avec suppression des fichiers audio associés

### Morceaux

- Référentiel de morceaux avec titre, compositeur, tonalité et statut (En apprentissage / Au répertoire / Abandonné)
- Historique complet d'un morceau : toutes ses prises toutes sessions confondues, triées par date décroissante
- Liste des morceaux avec nombre de prises disponibles

### Commentaires

- Commentaires globaux ou ancrés à un timestamp précis sur la waveform
- Marqueurs cliquables sur la waveform → seek + scroll vers le commentaire

### Playlists

- Création de playlists de prises spécifiques
- Lecture en continu avec enchaînement automatique
- Réorganisation par drag & drop
- Ajout d'une prise à une playlist depuis le lecteur

### Agenda partagé

- Vue mensuelle avec navigation mois par mois
- Trois types d'événements : **Indisponibilité** (personnelle), **Répétition**, **Concert**
- Les événements peuvent avoir un lieu et des notes
- Les répétitions et concerts appartiennent au groupe actif et peuvent être liés à une session existante
- Les indisponibilités sont personnelles : elles suivent l'utilisateur et restent visibles par les membres de ses groupes
- Modification / suppression : chacun ne peut modifier ou supprimer que sa propre indisponibilité ; répétitions et concerts sont modifiables et supprimables par les membres du groupe

### Tableau de bord

- 5 dernières sessions avec résumé des morceaux travaillés
- Playlists triées par dernière modification

### Administration (rôle admin uniquement)

- Gestion des morceaux (`/admin/songs`) : ajout, modification, statut, suppression
- Gestion des utilisateurs (`/admin/users`) : création, modification du rôle, réinitialisation du mot de passe, désactivation, suppression
- Statistiques et 10 dernières prises avec suppression

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

### 4. Créer le premier compte admin

```bash
node scripts/create-user.mjs --nickname=TonPseudo --password=tonmotdepasse --role=admin
```

Le script peut aussi créer des comptes `user` (rôle par défaut). Les comptes suivants se gèrent depuis `/admin/users`.

### 5. Lancer le serveur de développement

```bash
pnpm dev
```

L'application est disponible sur [http://localhost:5173](http://localhost:5173).

> Les fichiers audio sont toujours servis par Node (route `/audio/[id]`), en dev comme en production, afin de vérifier la session et l'appartenance au groupe. En production, Caddy proxifie cette route sans jamais la servir statiquement lui-même.

---

## Déployer sur un VPS

La procédure complète (prérequis, premier déploiement, mises à jour, migrations,
sauvegarde, architecture) est documentée dans **[deploy.md](deploy.md)**, qui fait
foi. Résumé :

```bash
# Premier déploiement
git clone <url-repo> ~/music-band-site && cd ~/music-band-site
cp .env.example .env && nano .env   # AUTH_SECRET, POSTGRES_PASSWORD, ORIGIN
docker compose up -d --build

# Mise à jour après un changement de code
cd ~/music-band-site
git pull
docker compose up -d --build app
```

Seul le conteneur `app` est reconstruit lors d'une mise à jour ; la base de données
et les fichiers audio ne sont pas affectés (volumes persistants). Les fichiers
`migrations/` s'appliquent automatiquement au premier démarrage de la base ; sur une
base existante, une nouvelle migration s'applique manuellement (voir
[deploy.md](deploy.md#appliquer-une-migration)).

Caddy tourne en **service système** sur le VPS (hors `docker-compose.yml`, géré par
`vps-rockandmore`) et proxifie `localhost:3000`, y compris `/audio/*` — les fichiers
audio transitent toujours par Node pour vérifier la session et l'appartenance au
groupe, jamais servis statiquement par Caddy.
