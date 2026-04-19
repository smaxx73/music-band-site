# Conventions et architecture

## Structure des fichiers

```
src/
├── lib/
│   ├── server/
│   │   ├── db.ts          # client postgres.js + helpers SQL
│   │   ├── storage.ts     # lecture/écriture fichiers audio
│   │   └── ffmpeg.ts      # conversion mp3, découpe silence, durée
│   └── components/
│       ├── Player.svelte          # lecteur WaveSurfer.js
│       ├── CommentPin.svelte      # marqueur sur waveform
│       ├── RecordingCard.svelte
│       ├── SessionCard.svelte
│       └── PlaylistPlayer.svelte
├── routes/
│   ├── +layout.svelte     # layout global + vérif auth
│   ├── +page.svelte       # tableau de bord
│   ├── sessions/[id]/+page.svelte
│   ├── songs/[id]/+page.svelte
│   ├── recording/[id]/+page.svelte
│   ├── playlists/[id]/+page.svelte
│   ├── upload/+page.svelte
│   ├── admin/songs/+page.svelte
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
  status: 'en_cours' | 'au_point' | 'repertoire'
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
- Cookie signé `band_session` vérifié dans `+layout.server.ts`
- Si absent ou invalide → redirect `/login`
- Le prénom saisi au login est dans le cookie → utilisé comme `author` / `uploaded_by`
- `AUTH_PASSWORD` et `AUTH_SECRET` dans `.env` uniquement

## Fichiers audio
- Stockés dans `/data/audio/{recording_id}.mp3`
- Convertis en mp3 128kbps à l'upload via ffmpeg
- Nginx les sert depuis `/audio/` — jamais Node
- `BODY_SIZE_LIMIT` configuré dans `svelte.config.js` pour les gros uploads
- Ne jamais les charger entièrement en mémoire Node

## Données
- `recordings` est le nœud central — il appartient à une session ET à un morceau
- Vue session = requête sur `recordings` groupée par `song_id`
- Vue morceau = requête sur `recordings` filtrée par `song_id`, toutes sessions
- Une playlist pointe vers des `recordings` spécifiques (pas des morceaux)
- Le `take` est toujours calculé automatiquement — jamais saisi manuellement
