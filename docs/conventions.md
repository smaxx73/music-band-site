# Conventions et architecture

## Structure des fichiers

```
src/
├── lib/
│   ├── server/
│   │   ├── db.ts          # client postgres.js + helpers SQL
│   │   ├── storage.ts     # lecture/écriture fichiers audio
│   │   ├── ffmpeg.ts      # conversion mp3, proxy, détection des blancs, canal muet, extraction, durée,
│   │   │                  #   miniature du logo de groupe, recadrage des images déposées
│   │   ├── audio-enhance.ts # amélioration du son d'une prise : mesure, aperçu, application,
│   │   │                  #   retour à l'original (réglages partagés : src/lib/audio-enhance.ts)
│   │   ├── upload-stream.ts # réception multipart d'un fichier audio (prise ou import)
│   │   ├── imports.ts     # zone de transit des outils audio d'après upload
│   │   ├── youtube.ts     # vidéo YouTube d'une prise : lien, oEmbed, doublon
│   │   ├── setlists.ts    # lecture des setlists et de leur programme (durée sommée)
│   │   ├── comments.ts    # commentaires d'une cible (prise, setlist ou publication) + réactions
│   │   ├── personal.ts    # espace perso : enregistrements d'un utilisateur, fichiers, droit d'écoute,
│   │   │                  #   classement d'un enregistrement en prise d'une session
│   │   ├── posts.ts       # publications dans le groupe (enregistrement perso, vidéo, suggestion) + pouces
│   │   ├── feed.ts        # fil d'actualité : toutes les sources ordonnées, paginé par curseur
│   │   ├── share-links.ts # liens d'écoute publics : jeton, résolution, ce qui est exposé
│   │   ├── songs.ts       # référentiel : lecture du formulaire de fiche, modification,
│   │   │                  #   suppression d'un morceau (scopée au groupe, sans prise)
│   │   ├── song-covers.ts # pochettes de morceau : dépôt (recadrage ffmpeg), lecture, retrait
│   │   ├── score-documents.ts # feuilles de répétition : validation, accès, droit de suppression
│   │   ├── session-photos.ts # photo de bandeau d'une session : dépôt (recadrage ffmpeg), lecture, retrait
│   │   ├── members.ts     # page d'un membre : fiche dans le groupe actif, activité récente
│   │   ├── avatars.ts     # photo de profil : dépôt (recadrage ffmpeg), retrait, lecture selon
│   │   │                  #   le partage d'un groupe, versions d'un lot de comptes (fil)
│   │   ├── places.ts      # lieux du groupe (/group) : liste, ajout, modification (renommage propagé), retrait
│   │   ├── addresses.ts   # Base Adresse Nationale : recherche d'une adresse pour un lieu
│   │   ├── images.ts      # images déposées : format lu dans les octets, taille de requête
│   │   ├── deezer.ts      # catalogue Deezer : recherche d'une reprise, détail, pochette d'album
│   │   └── notifications.ts # écriture (fan-out, filtré par les préférences) et lecture
	│   └── components/
	│       ├── ConfirmDialog.svelte   # confirmation réutilisable, selon le niveau de risque
│       ├── Menu.svelte            # menu déroulant (bouton + panneau) : partage, ⋮ d'une prise,
│       │                          #   cloche des notifications
│       ├── AudioPlayer.svelte     # lecteur WaveSurfer.js
│       ├── AudioRecorder.svelte   # enregistrement en direct depuis le navigateur (micro, interface)
│       ├── YouTubePlayer.svelte   # lecteur de la vidéo YouTube d'une prise (API IFrame, chargée à la demande)
│       ├── YouTubeEmbed.svelte    # vidéo YouTube citée dans un commentaire (vignette, iframe au clic)
│       ├── CommentsPanel.svelte   # commentaires d'une prise + formulaire d'ajout (page lecteur)
│       ├── MentionTextarea.svelte # saisie de commentaire avec autocomplétion des @mentions
│       ├── MembersInput.svelte    # participants d'une session en vignettes (saisie libre)
│       ├── CommentList.svelte     # liste de commentaires + réactions 👍/👎 (partagée) ;
│       │                          #   commentaire courant, suivi de lecture, repli des plus anciens
│       ├── RecordingRow.svelte     # une prise en piste de tracklist (vues session et morceau) ;
│       │                          #   porte le menu ⋮ de la prise et l'état « en lecture »
│       ├── SongCover.svelte       # pochette d'un morceau : l'image déposée, sinon un dégradé
│       ├── Avatar.svelte          # pastille d'un membre : sa photo de profil, sinon ses initiales
│       ├── InstrumentsInput.svelte # instruments joués dans un groupe, en vignettes (profil)
│       ├── SongFields.svelte      # champs de la fiche d'un morceau (ajout, tableau de /songs,
│       │                          #   édition sur la page du morceau)
│       ├── SongCoverEditor.svelte # déposer, remplacer, retirer la pochette (page du morceau)
│       ├── CatalogSearch.svelte   # recherche d'une reprise sur Deezer (fiche et pochette)
│       ├── PlayAllButton.svelte   # « tout écouter » : enchaîne des prises dans le mini-lecteur
│       ├── RoundPlayButton.svelte # le ▶ rond orange des en-têtes (affichage seul)
│       ├── MediaHeader.svelte     # en-tête des pages qui listent des prises (session, morceau, playlist)
│       ├── SessionCover.svelte    # visuel d'une session : feuillet d'éphéméride teinté par le type
│       ├── IconCover.svelte       # visuel fixe d'une page qui rassemble des morceaux (référentiel, playlist)
│       ├── RecordingComments.svelte # commentaires d'une prise chargés à la demande (hors lecteur)
│       ├── NotificationsMenu.svelte # cloche + menu des notifications (barre du haut)
│       ├── GroupSwitcher.svelte   # groupe actif (logo, nom) et changement de groupe
│       ├── AddMenu.svelte         # « + Ajouter » : enregistrer, envoyer, session, publier
│       ├── PlaylistQueue.svelte   # mode édition d'une playlist : ordre (glisser), retrait
│       ├── PlaylistTrackRow.svelte # une piste de playlist, en lecture
│       ├── SongListRow.svelte     # un morceau du référentiel, en lecture (/songs)
│       ├── TrackRow.svelte        # socle de toute piste (prise, piste de playlist, morceau) :
│       │                          #   grille, repli, survol, état « en cours », tiroir
│       ├── TrackLead.svelte       # colonne de tête d'une piste : numéro, ▶ au survol, égaliseur
│       ├── SetlistSongs.svelte    # programme d'une setlist : ordre (glisser + ↑↓), retrait
│       ├── AddToPlaylistButton.svelte # ajout d'une prise à une playlist (sélecteur + création)
│       ├── AddToSetlistButton.svelte  # ajout d'un morceau à une setlist (listes et vue morceau)
│       ├── MediaPlayer.svelte     # lecteur d'un enregistrement perso (audio et/ou vidéo, hors barre du bas)
│       ├── PublishDialog.svelte   # publier dans le groupe actif : enregistrement perso, vidéo, suggestion
│       ├── ClassifyDialog.svelte  # classer un enregistrement perso en prise (session + morceau)
│       ├── AudioEnhanceDialog.svelte # améliorer le son d'une prise : mesure, chaîne, écoute comparée
│       ├── PendingImports.svelte  # fichiers encore en transit : reprendre ou refaire une découpe
│       ├── ShareLinkDialog.svelte # liens d'écoute publics d'un enregistrement : créer, révoquer
│       ├── ShareMenu.svelte       # bouton « Partager » d'une prise : lien pour le groupe, lien public
│       ├── PostReactions.svelte   # pouces 👍/👎 d'une publication (fil et page de la publication)
│       ├── FeedItem.svelte        # une carte du fil d'actualité, selon le type d'élément
│       ├── SongSelect.svelte      # sélecteur de morceau + création sur place (« À nommer — … »)
│       ├── SessionEditor.svelte   # édition des métadonnées de session
│       ├── LocationInput.svelte   # lieu d'une session ou d'un événement : lieu du groupe ou adresse
│       ├── AddressField.svelte    # adresse d'un lieu du groupe (Base Adresse Nationale), dans /group
│       ├── GroupPlaces.svelte     # section « Lieux » de /group : liste, gestion par l'admin du groupe
│       ├── SuggestInput.svelte    # champ libre avec suggestions (combobox ARIA), générique
│       ├── SessionPhotoAdd.svelte   # ajouter une photo de bandeau depuis l'en-tête (session sans photo)
│       ├── SessionPhotoField.svelte # photo de bandeau en édition de session : remplacer, retirer, voile
│       ├── SongChartPrototype.svelte # feuille de répétition : lecture, et atelier de blocs
│       │                          #   ChordPro / ABC en édition
│       └── SongDetails.svelte     # paroles et notes musicales
├── routes/
│   ├── +layout.svelte     # layout global + vérif auth
│   ├── +page.svelte       # tableau de bord
│   ├── sessions/[id]/+page.svelte
│   ├── songs/+page.svelte         # liste + gestion référentiel (tout membre du groupe)
│   ├── songs/[id]/+page.svelte
│   ├── songs/[id]/partition/+page.svelte # feuille de répétition du morceau
│   ├── recording/[id]/+page.svelte
│   ├── playlists/[id]/+page.svelte
│   ├── setlists/+page.svelte
│   ├── setlists/[id]/+page.svelte
│   ├── upload/+page.svelte
│   ├── decoupe/[id]/+page.svelte  # découpe d'un import sur les blancs (groupe ou espace perso)
│   ├── record/+page.svelte        # enregistrement en direct, classé après coup
│   ├── perso/+page.svelte         # espace personnel (hors groupe)
│   ├── perso/[id]/+page.svelte    # un enregistrement perso
│   ├── posts/[id]/+page.svelte    # une publication + ses commentaires
│   ├── members/[id]/+page.svelte  # un membre du groupe actif : fiche et activité
│   ├── fil/+page.svelte           # fil d'actualité du groupe actif
│   ├── ecoute/[token]/            # écoute publique sans compte (page + fichier audio)
│   └── api/               # voir src/routes/api/CLAUDE.md
data/audio/                # fichiers mp3 (volume Docker)
schema.sql                 # schéma SQL — source de vérité
migrations/                # 001_init.sql, 002_...sql, ...
```

## TypeScript
- Strict partout, pas de `any`
- Les types des entités DB sont définis dans `src/lib/types.ts`
- Exemple de type attendu :
```typescript
type Recording = {
  id: number
  session_id: number
  song_id: number
  take: number
  file_path: string
  duration_s: number | null
  status: string // qualité libre : 'À revoir' | 'Moyen' | 'Bon' | 'Référence' | texte court
  file_hash: string | null
  notes: string | null
  uploaded_by: string
  created_at: Date
}
```

## Confirmations d'action

Les confirmations client utilisent `ConfirmDialog.svelte`, jamais `window.confirm()` dans une
nouvelle vue. Le composant affiche une modale cohérente et associe explicitement le traitement
visuel à l'impact de l'action.

| Niveau | Cas d'emploi | Bouton de validation |
|---|---|---|
| `info` | action sans perte, mais qui mérite une seconde intention | secondaire |
| `warning` | abandon d'un brouillon ou conséquence réversible | principal |
| `danger` | suppression ou perte définitive de contenu | danger, libellé explicite |

Une action `danger` doit nommer ce qui sera perdu et ses conséquences (par exemple les
commentaires supprimés en cascade). Elle conserve en plus les contrôles d'autorisation côté API :
la confirmation est une protection d'interface, jamais une règle de sécurité.

Sur un formulaire `use:enhance`, un `onsubmit` qui appelle `preventDefault()` **n'arrête
rien** : le gestionnaire de SvelteKit envoie quand même. La confirmation passe par
`createSubmitConfirm` (`src/lib/confirm-submit.svelte.ts`), appelé en tête de la fonction
`enhance` : il annule l'envoi par `cancel()`, pose la question, et relance le formulaire
sur « oui ».

## Base de données
- SQL brut via `postgres.js` — pas de Prisma, pas de Drizzle
- Toutes les requêtes passent par `src/lib/server/db.ts`
- `postgres.js` : `ssl: false` en dev Docker, `ssl: 'require'` si base externe
- Toute modification du schéma = nouveau fichier numéroté dans `migrations/`

## Auth
- Cookie signé `band_session` vérifié dans `hooks.server.ts`
- Mot de passe individuel stocké en hash `scrypt` dans `users.password_hash`
- Si absent ou invalide → redirect `/login`
- L'utilisateur connecté fournit `author` / `uploaded_by`
- Le groupe actif est persisté dans le cookie `band_group`
- `AUTH_SECRET` dans `.env` uniquement

## Fichiers audio
- Stockés dans `/data/audio/{recording_id}.mp3`
- Une prise au son amélioré garde son original à côté : `/data/audio/{id}.original.mp3`,
  jamais servi par `/audio/` (seulement par `/api/recordings/[id]/enhance/audio`). Effacer
  les fichiers d'une prise passe par `removeRecordingFiles`
- Enregistrements perso dans `/data/audio/perso/{id}.mp3`, servis par `/audio/perso/`
- Un lien d'écoute public sert le même fichier par `/ecoute/[token]/audio`, toujours par
  Node : le jeton y remplace la session, et se revérifie à chaque requête
- Convertis en mp3 192 kbps (débit constant) à l'upload via ffmpeg — 128 kbps pour les
  fichiers antérieurs au passage à 192k
- Servis par Node (`src/routes/audio/[id]/+server.ts`), en développement comme en production :
  la route vérifie la session et l'appartenance de la prise au groupe actif avant d'ouvrir le
  fichier. Caddy proxyfie `/audio/*` vers l'application et ne sert jamais `AUDIO_DIR` lui-même —
  la protection ne doit pas dépendre de la configuration du proxy
- `BODY_SIZE_LIMIT` configuré dans `docker-compose.yml` (200M), aligné sur `MAX_UPLOAD_SIZE`
  de `src/lib/server/upload-stream.ts` — les deux doivent bouger ensemble
- Ne jamais les charger entièrement en mémoire Node
- Un fichier déposé mais pas encore validé (import à découper) reste **hors** `AUDIO_DIR` :
  ce dossier est celui des prises validées, dont l'accès s'autorise par l'id de la prise. Il
  vit dans le répertoire temporaire du conteneur. Voir `src/lib/server/imports.ts`
- Un import tient en deux fichiers : l'**original** intact, dans lequel les prises sont
  taillées, et un **proxy** léger qui porte l'analyse et la préécoute. On travaille sur le
  proxy, on rend depuis l'original — jamais l'inverse
- Les doublons sont détectés par `recordings.file_hash` avant conversion

## Styles partagés

Pas de framework CSS : les tokens et les classes communes vivent dans `src/app.css`. Une page
n'écrit dans son `<style>` que ce qui lui est propre.

- **Couleurs, tailles, rayons, ombres** : toujours un token (`var(--color-…)`, `--text-…`,
  `--radius-…`, `--shadow-popover` / `--shadow-modal`), jamais une valeur en dur. Un besoin
  nouveau (une teinte d'avertissement, un rouge de danger) devient un token, pas un hexadécimal
- **Tailles de police** : sept paliers, `--text-2xs` (11 px) à `--text-xl` (24 px), avec
  leur rôle en tête de `src/app.css`. Pas de taille entre deux paliers : la nuance passe
  par la couleur et la graisse. Une taille en dur ne règle qu'un glyphe (×, ▶, initiale
  d'avatar), jamais du texte
- **Colonne de page** : `<main class="page">` (720 px), `page-narrow` (640 px, formulaire ou
  liste simple) ou `page-wide` (900 px, en-tête média, tableau, agenda). Marges et repli
  mobile sont portés par la classe — ne pas redéfinir `main` dans la page
- **En-tête de page** : `.page-header` (titre à gauche, action principale à droite, passe
  sous le titre faute de place sans s'étirer), `.page-actions` s'il y a plusieurs boutons.
  Ne pas le redéfinir dans la page
- **Boutons** : `.btn` + une variante (`btn-primary`, `btn-secondary`, `btn-ghost`,
  `btn-danger`) + une taille (`btn-sm`, `btn-lg`, `btn-icon`). Une action dans une phrase
  est un `.btn-link` (orange), `.btn-link-muted` quand elle renonce (« Retirer »).
  Pas de `.btn-delete` / `.remove-btn` local
- **Créer** (nouvelle session, publier, ajouter une prise…) : `<Icon name="plus" />` suivi
  du verbe, jamais un « + » tapé — un glyphe ne s'aligne pas sur les icônes voisines.
  L'action principale d'une page est un `btn-primary` de taille normale (`btn-sm` reste aux
  commandes d'une ligne ou d'un tiroir), une seule par écran. Le bouton qui referme le
  formulaire de création (« Annuler ») redevient `btn-secondary`. L'orange plein est
  réservé à « + Ajouter » de la navigation et à la lecture (▶) : sur un bouton à texte
  blanc, il n'atteint pas le contraste requis
- **Focus clavier** : l'anneau orange est global (`:focus-visible`). Un composant ne le
  retire que pour en dessiner un équivalent
- **Menu déroulant** : `Menu.svelte`, jamais un panneau et ses écouteurs (clic à côté,
  Échap) réécrits à la main. Ses entrées portent `.menu-item`
- **Type de session** : ses couleurs viennent de `.session-type-{type}`, qui expose
  `--type-bg`, `--type-text`, `--type-from`, `--type-to` ; la liste et les libellés de
  `SESSION_TYPES` et `sessionTypeLabel` (`src/lib/types.ts`)

## Tableaux et mobile

Un tableau sert à **comparer des valeurs alignées** d'une ligne à l'autre. Une liste dont
chaque ligne porte surtout des contrôles n'en est pas un : elle se construit en flex, et se
replie seule. C'est le cas des prises (`RecordingRow.svelte`) — ne pas les remettre en
tableau. Toute ligne de ce genre — prise, piste de playlist, morceau du référentiel — se
bâtit sur `TrackRow.svelte`, qui porte seul la grille, le repli sur ligne étroite, le
survol et l'état « en cours » : une liste n'y met que son contenu, pour que deux listes
ne divergent pas. Les règles ci-dessous valent pour les vrais tableaux : `/songs` (mode édition ;
sa vue de lecture est une liste, `SongListRow.svelte`), `/admin/users`,
`/admin/groups`, `/playlists`.

Attention à la largeur réellement disponible : la colonne de contenu vaut la fenêtre **moins
les 188 px de la sidebar** à partir de 1024 px, moins les 76 px du rail entre 641 et 1023 px.
Un tableau confortable à 640 px de bascule ne l'est pas forcément à 1024 px de fenêtre.

- Tout tableau porte `class="data-table"` (styles dans `src/app.css`) — ne jamais redéfinir
  `table` / `th` / `td` dans le `<style>` d'une page
- Sous 640 px, `app.css` transforme **tout** `.data-table` en pile de cartes : `thead`
  masqué, chaque ligne devient une carte en flex. Une page n'ajoute que ce qui lui est
  propre : l'ordre des cellules (`order`), celles qui prennent toute la largeur
- Une cellule dont l'en-tête manquerait à la lecture porte `data-label="…"` : le libellé
  est repris devant son contenu une fois l'en-tête masqué
- Chaque tableau vit dans un `<div class="table-scroll">` : plus large que sa colonne, il
  défile sur lui-même au lieu d'élargir la page (mode édition des prises, fenêtre étroite)

## Données
- Les noms de tables ne sont pas les mots de l'écran : `recordings` = les **prises**,
  `personal_recordings` = les **enregistrements** perso — voir « Vocabulaire » dans docs/features.md
- `recordings` est le nœud central — il appartient à une session ET à un morceau
- Vue session = requête sur `recordings` groupée par `song_id`
- Vue morceau = requête sur `recordings` filtrée par `song_id`, toutes sessions
- Une playlist pointe vers des `recordings` spécifiques (pas des morceaux)
- Une setlist, elle, pointe vers des `songs` : c'est un programme à jouer, pas des prises
  à réécouter. Son temps total n'est pas stocké, il se somme depuis
  `songs.reference_duration_s` — voir « Setlists » dans docs/features.md
- Un commentaire porte sur une prise, une setlist **ou** une publication (contrainte `comments_target`) :
  c'est sa cible qui dit à quel groupe il appartient, et donc qui a le droit de le lire
- Le `take` est toujours calculé automatiquement — jamais saisi manuellement
- Les entités métier visibles sont filtrées par `current_group_id`, sauf les indisponibilités personnelles qui sont filtrées par appartenance utilisateur au groupe actif
- L'espace perso (`personal_recordings`) est filtré par propriétaire, jamais par groupe. Il
  n'entre dans un groupe que par une publication (`posts`), qui le **désigne** sans le copier
