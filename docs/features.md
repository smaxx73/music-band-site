# Comportements attendus par feature

## Upload d'une prise

1. Sélection de la **session** (existante ou création à la volée) et du **morceau**
   (liste depuis `songs` où `status != 'abandonne'`)
2. Réception multipart : fichier audio + `session_id`, `song_id`, `uploaded_by`
3. Validation : extension audio autorisée, taille < 200 Mo, `song_id` existe en base
4. Calcul du `take` dans une transaction :
   `SELECT COALESCE(MAX(take), 0) + 1 FROM recordings WHERE session_id=$1 AND song_id=$2`
5. Conversion ffmpeg → mp3 128kbps + suppression silence début/fin
6. Extraction durée via ffprobe
7. Sauvegarde `/data/audio/{id}.mp3`
8. Insertion en base, retour du `recording` créé

## Vue session (`/sessions/[id]`)

- Prises groupées par morceau, triées par `take` ASC
- Chaque morceau : toutes ses prises + statut + nombre de commentaires
- Modification possible : date, lieu, notes, membres de la session
- Modification possible par prise : statut, notes
- Ajout d'une prise oubliée à une session passée : autorisé

## Vue morceau (`/songs/[id]`)

- Toutes les prises de ce morceau, toutes sessions confondues
- Triées par date de session décroissante
- Objectif : visualiser l'évolution du morceau dans le temps

## Lecteur audio (`/recording/[id]`)

- WaveSurfer.js initialisé dans `onMount`, importé dynamiquement
- URL audio : `/audio/{recording_id}.mp3` (Nginx, pas Node)
- Commentaires avec `timestamp_s` → marqueurs sur la waveform
- Clic sur un marqueur → seek à ce timestamp + scroll vers le commentaire
- Contrôles : ⏮ retour début | ▶/⏸ | ⏭ +10s | temps courant/total | volume
- Ajout de commentaire : global OU ancré à la position courante du lecteur
- La case "ancrer au timestamp" est cochée par défaut si le lecteur est en pause
- Prénom pré-rempli depuis le cookie de session

## Playlists (`/playlists/[id]`)

- Lecture en continu : enchaînement automatique dans l'ordre `position`
- Chaque item affiche : titre du morceau, date session, numéro de prise, note
- Ordre modifiable par drag & drop → PATCH `position`
- Depuis `/recording/[id]` : bouton "Ajouter à une playlist"

## Référentiel de morceaux (`/admin/songs`)

- Ajout : titre (unique), compositeur, tonalité, statut
- Modification possible après coup
- Statut `abandonne` → masqué dans le sélecteur d'upload, prises existantes conservées
- Suppression bloquée si des prises existent pour ce morceau

## Agenda partagé (`/agenda`)

- Vue mensuelle en grille 7 colonnes (lundi → dimanche), navigation mois par mois
- Chaque membre peut ajouter sur n'importe quel jour un événement de trois types :
  - `indisponibilite` — indisponibilité personnelle ; seul l'auteur peut la supprimer
  - `repetition` — répétition de groupe ; tout membre peut la supprimer
  - `concert` — concert ; tout membre peut le supprimer
- Répétition et concert peuvent être liés à une `session` existante (optionnel)
- Clic sur un jour → panneau détail : liste des événements du jour + formulaire d'ajout
- Badges colorés : rouge = indisponible, bleu = répétition, vert = concert
- `author` = prénom du cookie de session (comme partout)

## Tableau de bord (`/`)

- Colonne gauche : 5 dernières sessions (date, morceaux travaillés en résumé)
- Colonne droite : playlists triées par date de modification
- Bouton [+ Uploader] toujours visible en haut
