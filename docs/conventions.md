# Conventions et architecture

## Structure des fichiers

```
src/
├── lib/
│   ├── server/
│   │   ├── db.ts          # client postgres.js + helpers SQL
│   │   ├── storage.ts     # lecture/écriture fichiers audio
│   │   ├── ffmpeg.ts      # conversion mp3, proxy, détection des blancs, extraction, durée
│   │   ├── upload-stream.ts # réception multipart d'un fichier audio (prise ou import)
│   │   ├── imports.ts     # zone de transit des outils audio d'après upload
│   │   ├── youtube.ts     # vidéo YouTube d'une prise : lien, oEmbed, doublon
│   │   ├── setlists.ts    # lecture des setlists et de leur programme (durée sommée)
│   │   ├── comments.ts    # commentaires d'une cible (prise ou setlist) + réactions
│   │   └── notifications.ts # écriture (fan-out) et lecture des notifications
	│   └── components/
	│       ├── ConfirmDialog.svelte   # confirmation réutilisable, selon le niveau de risque
│       ├── AudioPlayer.svelte     # lecteur WaveSurfer.js
│       ├── YouTubePlayer.svelte   # lecteur de la vidéo YouTube d'une prise (API IFrame, chargée à la demande)
│       ├── YouTubeEmbed.svelte    # vidéo YouTube citée dans un commentaire (vignette, iframe au clic)
│       ├── CommentsPanel.svelte   # commentaires d'une prise + formulaire d'ajout (page lecteur)
│       ├── MentionTextarea.svelte # saisie de commentaire avec autocomplétion des @mentions
│       ├── MembersInput.svelte    # participants d'une session en vignettes (saisie libre)
│       ├── CommentList.svelte     # liste de commentaires + réactions 👍/👎 (partagée) ;
│       │                          #   commentaire courant, suivi de lecture, repli des plus anciens
│       ├── RecordingRow.svelte     # une prise en ligne-carte (vues session et morceau) ;
│       │                          #   porte le menu ⋮ de la prise
│       ├── RecordingComments.svelte # commentaires d'une prise chargés à la demande (hors lecteur)
│       ├── NotificationsMenu.svelte # cloche + menu des notifications (barre du haut)
│       ├── PlaylistQueue.svelte   # file de lecture playlist
│       ├── SetlistSongs.svelte    # programme d'une setlist : ordre (glisser + ↑↓), retrait
│       ├── AddToPlaylistButton.svelte # ajout d'une prise à une playlist (sélecteur + création)
│       ├── AddToSetlistButton.svelte  # ajout d'un morceau à une setlist (listes et vue morceau)
│       ├── SessionEditor.svelte   # édition des métadonnées de session
│       └── SongDetails.svelte     # paroles et notes musicales
├── routes/
│   ├── +layout.svelte     # layout global + vérif auth
│   ├── +page.svelte       # tableau de bord
│   ├── sessions/[id]/+page.svelte
│   ├── songs/+page.svelte         # liste + gestion référentiel (tout membre du groupe)
│   ├── songs/[id]/+page.svelte
│   ├── recording/[id]/+page.svelte
│   ├── playlists/[id]/+page.svelte
│   ├── setlists/+page.svelte
│   ├── setlists/[id]/+page.svelte
│   ├── upload/+page.svelte
│   ├── upload/decoupe/[id]/+page.svelte  # découpe d'un import sur les blancs
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
- Convertis en mp3 128kbps à l'upload via ffmpeg
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

## Tableaux et mobile

Un tableau sert à **comparer des valeurs alignées** d'une ligne à l'autre. Une liste dont
chaque ligne porte surtout des contrôles n'en est pas un : elle se construit en flex, et se
replie seule. C'est le cas des prises (`RecordingRow.svelte`) — ne pas les remettre en
tableau. Les règles ci-dessous valent pour les vrais tableaux : `/songs`, `/admin/users`,
`/admin/groups`, `/playlists`.

Attention à la largeur réellement disponible : la colonne de contenu vaut la fenêtre **moins
les 188 px de la sidebar**. Un tableau confortable à 640 px de bascule ne l'est pas à 900 px
de fenêtre.

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
- `recordings` est le nœud central — il appartient à une session ET à un morceau
- Vue session = requête sur `recordings` groupée par `song_id`
- Vue morceau = requête sur `recordings` filtrée par `song_id`, toutes sessions
- Une playlist pointe vers des `recordings` spécifiques (pas des morceaux)
- Une setlist, elle, pointe vers des `songs` : c'est un programme à jouer, pas des prises
  à réécouter. Son temps total n'est pas stocké, il se somme depuis
  `songs.reference_duration_s` — voir « Setlists » dans docs/features.md
- Un commentaire porte sur une prise **ou** sur une setlist (contrainte `comments_target`) :
  c'est sa cible qui dit à quel groupe il appartient, et donc qui a le droit de le lire
- Le `take` est toujours calculé automatiquement — jamais saisi manuellement
- Les entités métier visibles sont filtrées par `current_group_id`, sauf les indisponibilités personnelles qui sont filtrées par appartenance utilisateur au groupe actif
