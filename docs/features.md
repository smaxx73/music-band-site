# Comportements attendus par feature

## Upload d'une prise

1. Sélection de la **session** (existante ou création à la volée) et du **morceau**
   (liste depuis `songs` où `status != 'abandonne'`)
2. Réception multipart : fichier audio + `session_id`, `song_id`
3. Validation : MIME audio autorisé via `audio_formats`, taille < 200 Mo, session et morceau dans le groupe actif
4. Streaming du fichier brut vers un fichier temporaire et calcul SHA-256 sans charger l'audio en mémoire
5. Détection de doublon dans le groupe actif via `recordings.file_hash` ; retour `409` avec les informations de la prise existante si doublon
6. Conversion ffmpeg → mp3 128kbps + suppression silence début/fin
7. Extraction durée via ffprobe
8. Calcul du `take` dans une transaction :
   `SELECT COALESCE(MAX(take), 0) + 1 FROM recordings WHERE session_id=$1 AND song_id=$2`
9. Insertion en base avec `file_hash`, sauvegarde `/data/audio/{id}.mp3`, retour du `recording` créé

## Liste des sessions (`/sessions`)

- Liste des sessions du groupe actif, triées par date décroissante
- Bouton [+ Nouvelle session] → modale de création (type, date, titre, lieu, membres, notes)
- La création passe par `POST /api/sessions` et crée l'événement d'agenda lié

## Vue session (`/sessions/[id]`)

- Prises groupées par morceau, triées par `take` ASC
- Chaque morceau : toutes ses prises + qualité + nombre de commentaires
- Modification possible : date, type, titre, lieu, notes, membres de la session
- Modification possible par prise : qualité libre, notes
- Ajout d'une prise oubliée à une session passée : autorisé
- Le compteur de commentaires d'une prise est cliquable : il déplie la liste des commentaires
  sous la ligne, chargée à la demande via `GET /api/comments?recording_id=`, sans ouvrir le lecteur
- Mode édition : suppression de prise, déplacement dans l'ordre du morceau, puis renumérotation persistée
- Suppression d'une session : supprime la session, ses prises en cascade et les fichiers audio associés

## Vue morceau (`/songs/[id]`)

- Toutes les prises de ce morceau, toutes sessions confondues
- Triées par date de session décroissante
- Objectif : visualiser l'évolution du morceau dans le temps
- Les prises affichent leur libellé de qualité libre
- Le compteur de commentaires déplie la liste des commentaires de la prise, sans ouvrir le lecteur

## Lecteur audio (`/recording/[id]`)

- WaveSurfer.js initialisé dans `onMount`, importé dynamiquement
- URL audio : `/audio/{recording_id}.mp3` (Caddy en production, Node seulement en dev)
- Commentaires avec `timestamp_s` → marqueurs sur la waveform
- Clic sur un marqueur → seek à ce timestamp + scroll vers le commentaire
- Contrôles : ⏮ retour début | ▶/⏸ | ⏭ +10s | temps courant/total | volume
- Ajout de commentaire : global OU ancré à la position courante du lecteur
- La case "ancrer au timestamp" est cochée par défaut si le lecteur est en pause
- Auteur pré-rempli depuis l'utilisateur connecté

## Réactions aux commentaires

- Chaque membre peut réagir à un commentaire par 👍 ou 👎, depuis le lecteur comme depuis
  les listes dépliées des vues session et morceau
- Une seule réaction par membre et par commentaire : cliquer l'autre pouce la remplace,
  re-cliquer le même la retire (`DELETE`)
- `POST /api/comments/[id]/reactions` avec `{ value: 1 | -1 }`, `DELETE` pour retirer ;
  les deux retournent `{ up_count, down_count, my_reaction }`
- Les compteurs affichés sont mis à jour localement, sans rechargement de page

## Playlists (`/playlists/[id]`)

- Lecture en continu : enchaînement automatique dans l'ordre `position`
- Chaque item affiche : titre du morceau, date session, numéro de prise, note
- Ordre modifiable par drag & drop → PATCH `position`
- Depuis `/recording/[id]` : bouton "Ajouter à une playlist"

## Référentiel de morceaux (`/songs`)

- Géré par tout membre du groupe actif (pas réservé aux admins) — scope toujours par `current_group_id`
- Ajout : titre (unique dans le groupe), compositeur, tonalité, statut
- Modification possible après coup
- Statut `abandonne` → masqué dans le sélecteur d'upload, prises existantes conservées ; reste visible et modifiable dans `/songs`
- Suppression bloquée si des prises existent pour ce morceau
- Liste affiche tous les statuts du groupe actif, avec nombre de prises (`take_count`)

## Agenda partagé (`/agenda`)

- Vue mensuelle en grille 7 colonnes (lundi → dimanche), navigation mois par mois
- Chaque membre peut ajouter sur n'importe quel jour un événement :
- `indisponibilite` — indisponibilité personnelle, liée à `user_id` et sans `group_id`
- `repetition` | `concert` | `studio` | `autre` — événement de groupe, lié au groupe actif ;
  ces quatre types reflètent exactement `sessions.type`
- Toute session créée apparaît automatiquement dans l'agenda, quel que soit son type :
  `POST /api/sessions` insère l'événement lié, `PATCH` le synchronise (date, type, titre,
  notes, lieu) et `DELETE` le retire
- Un événement de groupe peut être lié à une `session` existante (optionnel)
- Chaque événement peut avoir `title`, `notes` et `location`
- Les indisponibilités affichées sont celles des utilisateurs membres du groupe actif
- Clic sur un jour → panneau détail : liste des événements du jour + formulaire d'ajout
- Badges colorés : rouge = indisponible, bleu = répétition, vert = concert, violet = studio, gris = autre
- Droits : seul l'auteur peut modifier ou supprimer son indisponibilité ; les événements de groupe sont modifiables/supprimables par les membres du groupe actif
- `author` = nom de l'utilisateur connecté

## Tableau de bord (`/`)

- Colonne gauche : 5 dernières sessions (date, morceaux travaillés en résumé)
- Colonne droite : flux d'actualité (sessions, playlists modifiées et **derniers commentaires**,
  triés par horodatage décroissant, chaque entrée renvoyant vers la page concernée),
  puis playlists triées par date de modification
- Bouton [+ Uploader] toujours visible en haut
