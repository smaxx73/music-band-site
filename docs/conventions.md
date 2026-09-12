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
│   │   └── notifications.ts # écriture (fan-out) et lecture des notifications
│   └── components/
│       ├── AudioPlayer.svelte     # lecteur WaveSurfer.js
│       ├── CommentsPanel.svelte   # commentaires d'une prise + formulaire d'ajout (page lecteur)
│       ├── CommentList.svelte     # liste de commentaires + réactions 👍/👎 (partagée)
│       ├── RecordingComments.svelte # commentaires d'une prise chargés à la demande (hors lecteur)
│       ├── NotificationsMenu.svelte # cloche + menu des notifications (barre du haut)
│       ├── PlaylistQueue.svelte   # file de lecture playlist
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
- Caddy les sert depuis `/audio/` en production ; Node ne les sert qu'en développement
- `BODY_SIZE_LIMIT` configuré dans `docker-compose.yml` (200M), aligné sur `MAX_UPLOAD_SIZE`
  de `src/lib/server/upload-stream.ts` — les deux doivent bouger ensemble
- Ne jamais les charger entièrement en mémoire Node
- Un fichier déposé mais pas encore validé (import à découper) reste **hors** `AUDIO_DIR` :
  Caddy sert ce dossier sans authentification. Voir `src/lib/server/imports.ts`
- Un import tient en deux fichiers : l'**original** intact, dans lequel les prises sont
  taillées, et un **proxy** léger qui porte l'analyse et la préécoute. On travaille sur le
  proxy, on rend depuis l'original — jamais l'inverse
- Les doublons sont détectés par `recordings.file_hash` avant conversion

## Données
- `recordings` est le nœud central — il appartient à une session ET à un morceau
- Vue session = requête sur `recordings` groupée par `song_id`
- Vue morceau = requête sur `recordings` filtrée par `song_id`, toutes sessions
- Une playlist pointe vers des `recordings` spécifiques (pas des morceaux)
- Le `take` est toujours calculé automatiquement — jamais saisi manuellement
- Les entités métier visibles sont filtrées par `current_group_id`, sauf les indisponibilités personnelles qui sont filtrées par appartenance utilisateur au groupe actif
