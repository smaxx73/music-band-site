# BandStash

Application web privée pour préparer les répétitions, archiver les prises et faire
circuler les idées d'un groupe de musique. Chaque personne possède son compte et peut
appartenir à plusieurs groupes ; tout le contenu collectif est rattaché au groupe actif.

## Fonctionnalités

### Capturer, importer et découper une répétition

- Dépôt de fichiers audio jusqu'à 200 Mo, conversion en MP3 192 kbps, retrait des silences en tête et en fin, et détection des doublons par empreinte SHA-256
- Son d'un seul côté (micro sur une seule entrée de la carte son) détecté et recopié sur les deux canaux ; `scripts/fix-single-channel.mjs` rattrape les fichiers déjà stockés
- Enregistrement direct depuis le navigateur (micro ou interface audio), avec choix de l'entrée, vumètre, pause/reprise, Wake Lock et copie de secours locale en cas d'échec de l'envoi
- Ajout d'une prise à une session et à un morceau, avec numérotation automatique par morceau (Prise 1, 2, 3…)
- Ajout d'une vidéo YouTube comme prise, avec ou sans piste audio associée
- **Découpe automatique d'une répétition sur les blancs** : le fichier est analysé et présenté en segments. Les seuils de silence, durée minimale et marge sont réglables ; chaque segment peut être écouté, écarté, associé à un morceau, ajusté, coupé ou fusionné avant validation
- La découpe analyse une copie légère, puis taille les extraits dans l'original. Les prises créées sont encodées une seule fois ; l'original est conservé sept jours pour reprendre ou refaire une découpe sans le renvoyer
- Création d'un morceau directement au moment du classement, y compris avec le titre provisoire « À nommer »

### Sessions

- Création de répétitions, concerts, séances studio ou autres sessions avec date, titre, lieu, participants et notes
- Création rapide d'une session lors d'un import ou d'un enregistrement ; un événement d'agenda lié est créé automatiquement
- Vue album d'une session : prises groupées par morceau, écoute enchaînée, qualité libre par prise et ajout de prises a posteriori
- Photo de bandeau de session recadrée automatiquement, avec voile réglable
- Lieux enregistrés au niveau du groupe ou adresses ponctuelles, avec recherche dans la Base Adresse Nationale et lien vers la carte

### Morceaux

- Référentiel par groupe : titre, compositeur, tonalité, artiste original, année, durée, paroles, notes et statut (en apprentissage, proposition de travail, au répertoire ou abandonné)
- Historique de toutes les prises d'un morceau et écoute enchaînée de son évolution
- Pochettes générées ou importées ; recherche d'une reprise dans Deezer pour préremplir ses informations et importer la pochette
- Feuille de répétition par morceau : blocs ChordPro et mini-partitions, import MusicXML/MXL, conservation des originaux et impression PDF

### Écoute et échanges

- Lecteur audio avec forme d'onde, navigation, saut de 10 secondes, volume et mini-lecteur persistant pendant la navigation
- Commentaires généraux ou ancrés sur un instant précis, marqueurs cliquables sur la forme d'onde, édition par leur auteur et réactions 👍/👎
- Mentions de membres, notifications d'activité et liens YouTube jouables directement dans les commentaires
- Notes libres et évaluation de la qualité de chaque prise
- Liens de partage internes et liens d'écoute publics à jeton pour les prises audio

### Playlists

- Playlists de prises précises, lecture continue et réorganisation par glisser-déposer
- Ajout d'une prise depuis son lecteur, une session ou la page d'un morceau
- Affichage des paroles et notes du morceau en cours d'écoute

### Setlists

- Programmes de répétition ou de concert composés de morceaux, à distinguer des playlists qui regroupent des prises
- Ordre modifiable au glisser-déposer ou avec des flèches sur mobile, durée totale estimée et commentaires dédiés

### Agenda partagé

- Vue mensuelle des répétitions, concerts et indisponibilités
- Événements avec lieu et notes ; répétitions et concerts liés à une session si besoin
- Indisponibilités personnelles, visibles par les membres des groupes concernés

### Espace personnel et fil du groupe

- Espace personnel pour conserver des idées, fichiers, captations directes et vidéos YouTube hors d'un groupe ; il peut lui aussi découper automatiquement un long enregistrement sur les blancs
- Publication d'un enregistrement personnel, d'une vidéo ou d'une suggestion de morceau dans un ou plusieurs groupes, sans dupliquer le fichier
- Classement ultérieur d'un enregistrement personnel dans une session, où il devient une prise
- Fil d'actualité du groupe pour les publications, sessions, prises, playlists et setlists, complété par un tableau de bord récapitulatif

### Groupes, droits et administration

- Groupes multiples avec changement de groupe actif, page de profil du groupe, logo, liens sociaux, membres et lieux partagés
- Rôles de membre et d'administrateur de groupe ; administrateurs globaux et superadministrateurs pour la gestion des comptes et des groupes
- Administration : utilisateurs, groupes, paramètres, statistiques, dernières prises et sauvegarde SQL téléchargeable
- Accès protégé aux fichiers audio : ils sont toujours servis par l'application après vérification de la session et des droits d'accès

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
