# Conventions routes API

## Verbes HTTP
- `GET`    → lecture, paginé si liste (`?limit=20&offset=0`)
- `POST`   → création, retourne l'objet créé avec son `id`
- `PATCH`  → modification partielle, retourne l'objet mis à jour
- `DELETE` → suppression, retourne `{ success: true }`

## Erreurs
Toujours retourner une erreur structurée avec le bon status HTTP :
```typescript
return json({ error: "message lisible" }, { status: 400 })
```

## Validation
Toujours valider les inputs côté serveur avant toute requête SQL.
Ne jamais faire confiance aux données du body sans vérification.

## Structure des routes
```
api/upload/+server.ts
api/imports/+server.ts
api/imports/[id]/+server.ts
api/imports/[id]/audio/+server.ts
api/imports/[id]/split/+server.ts
api/imports/[id]/redo/+server.ts
api/sessions/+server.ts
api/sessions/[id]/+server.ts
api/sessions/[id]/reorder/+server.ts
api/songs/+server.ts
api/songs/[id]/+server.ts
api/recordings/[id]/+server.ts
api/youtube/+server.ts
api/comments/+server.ts
api/comments/[id]/+server.ts
api/comments/[id]/reactions/+server.ts
api/notifications/+server.ts
api/notifications/[id]/+server.ts
api/playlists/+server.ts
api/playlists/[id]/+server.ts
api/playlists/[id]/items/+server.ts
api/setlists/+server.ts
api/setlists/[id]/+server.ts
api/setlists/[id]/items/+server.ts
api/setlists/[id]/items/[itemId]/+server.ts
api/agenda/+server.ts
api/agenda/[id]/+server.ts
api/groups/+server.ts
api/groups/[id]/+server.ts
api/groups/[id]/export/+server.ts
api/groups/[id]/logo/+server.ts
api/groups/[id]/members/+server.ts
api/groups/[id]/members/[userId]/+server.ts
api/groups/switch/+server.ts
```

## Auth
Toutes les routes API vérifient le cookie `band_session`.
Si absent → `return json({ error: "Non autorisé" }, { status: 401 })`
Les routes qui manipulent du contenu partagé vérifient aussi `locals.user.current_group_id`.

Deux niveaux de droits au-delà de l'authentification :
- **admin global** (`isAdmin(locals.user.role)`) → création/suppression de groupes, comptes,
  sauvegardes, statistiques
- **admin du groupe visé** (`canManageGroup(locals.user, groupId)`) → membres, nom, logo et liens
  du groupe, suppression du contenu d'autrui. Vrai aussi pour un admin global.
  `PATCH /api/groups/[id]` accepte `name` et/ou `youtube_url`, `facebook_url`, `instagram_url`
  (chaîne vide ou `null` = lien retiré). `POST /api/groups/[id]/logo` (multipart, champ `logo`)
  crée ou remplace le logo, `DELETE` le retire ; `GET` le sert aux membres (`canViewGroup`).
- **superadmin** (`canDeleteGroup`) → suppression et export d'un groupe.
  `DELETE /api/groups/[id]` exige en plus `?confirm=<nom exact du groupe>` et supprime tout
  le contenu en cascade ; `GET /api/groups/[id]/export` en fournit l'archive JSON préalable.
  Une archive ne contient jamais de `password_hash`.

Les **imports** (`api/imports/`) sont la zone de transit des outils audio d'après upload :
un fichier déposé qui n'est pas encore devenu des prises. Ils font exception au scope de
groupe seul — un import est **personnel** : le filtre `user_id = locals.user.id` s'ajoute
au groupe, et l'import d'un autre répond `404`. Rien n'y est publié, personne d'autre n'a
à le voir. Passer par `src/lib/server/imports.ts`, jamais par un SQL direct.
`POST /api/imports` (multipart, champs `audio` + `session_id`) dépose le fichier : l'original
est conservé tel quel et un proxy léger est fabriqué pour le travail ;
`GET /api/imports/[id]` relance la détection des blancs
(`?threshold_db=&min_silence_s=&min_segment_s=&pad_s=`, bornés côté serveur par
`normalizeParams`, qui retombe sur les défauts pour tout paramètre absent) ; `GET /api/imports/[id]/audio` sert le **proxy**
pour la pré-écoute, toujours par Node ; `POST /api/imports/[id]/split`
(`{ session_id, segments: [{ start_s, end_s, song_id }] }`) taille les extraits dans
l'**original**, crée les prises et consomme l'import **sans détruire l'original** ; `POST /api/imports/[id]/redo` rouvre une découpe
validée tant que l'original est en rétention (7 jours) — les prises déjà créées ne sont pas
touchées ; `DELETE /api/imports/[id]` l'abandonne et purge tout, y compris après validation.
Une découpe déjà validée répond `409` à `/split` et `404` aux routes d'analyse tant qu'elle
n'a pas été reprise.

Une prise a une **piste audio** (`file_path`), une **vidéo YouTube** (`youtube_video_id`,
`youtube_title`), ou les deux. `POST /api/youtube` (`{ session_id, song_id, video_url, duration_s? }`)
crée une prise vidéo seule ; `POST /api/upload` accepte un champ multipart `youtube_url` pour
rattacher la vidéo à la piste audio envoyée. Les deux passent par `resolveYouTubeVideo`
(`src/lib/server/youtube.ts`) : lien reconnu, vidéo lisible, `409` si déjà dans le groupe. Toute
route qui touche à `AUDIO_DIR` (peaks, suppression, volume, manifeste) filtre sur
`file_path IS NOT NULL` ; une prise sans piste audio ne va jamais dans une playlist (`400`).

Une **setlist** (`api/setlists/`) est un programme : des `songs` du groupe actif dans un
ordre. `GET /api/setlists` accepte `?song_id=` : chaque setlist porte alors `contains_song`,
pour que le sélecteur d'une vue morceau marque celles où le morceau est déjà programmé.
`POST /api/setlists` (`{ name, description?, song_id? }`) la crée et notifie le groupe ; avec
`song_id`, la setlist et son premier morceau naissent dans la **même transaction** — une erreur
ne laisse pas derrière elle une setlist vide que personne n'a demandée ;
`PATCH /api/setlists/[id]` accepte `name` et/ou `description` (tout membre) ;
`DELETE /api/setlists/[id]` est réservé à son auteur et aux admins du groupe
(`canDeleteGroupContent`, `403` sinon) et emporte programme et commentaires en cascade.
`POST /api/setlists/[id]/items` (`{ song_id }`) programme un morceau en fin de liste —
`409` s'il y est déjà, `400` s'il est `abandonne` ; `PATCH` du même chemin réécrit tout
l'ordre (`[{ id, position }]`) dans une transaction ; `DELETE .../items/[itemId]` retire un
morceau et réindexe. Les positions passent par le négatif avant d'être réécrites :
`UNIQUE (setlist_id, position)` refuserait les états intermédiaires. Passer par
`src/lib/server/setlists.ts` pour la lecture.

Un **commentaire** porte sur une prise **ou** sur une setlist, jamais les deux (contrainte
`comments_target`). `GET /api/comments` prend `?recording_id=` ou `?setlist_id=`, `POST`
le champ correspondant ; un `timestamp_s` sur une setlist répond `400` — il n'y a rien à y
ancrer. La vérification de droit est la **cible** : c'est elle qui appartient au groupe
actif, via `findCommentThread` (`src/lib/server/comments.ts`). Ne jamais rejoindre
`recordings` à la main pour retrouver le groupe d'un commentaire : un commentaire de
setlist n'a pas de prise.

Les notifications font exception au scope habituel : elles appartiennent à un destinataire.
Le filtre `user_id = locals.user.id` **est** la vérification de droit — personne, admin compris,
ne marque la notification d'un autre. Une notification d'autrui répond `404`, pas `403`.
`PATCH /api/notifications` marque tout comme lu dans le groupe actif ;
`PATCH /api/notifications/[id]` porte `{ read: true | false }` et ne touche que le groupe actif.
Le menu passe `?group_id=` (groupe pour lequel il est rendu) sur ces trois appels : le cookie
`band_group` étant commun aux onglets, un écart avec le groupe actif répond `409` et le client
recharge ses données au lieu d'afficher les notifications d'un autre groupe.

Ne jamais réécrire ces règles à la main : utiliser les helpers de `src/lib/types.ts`, et pour
les membres d'un groupe passer par `src/lib/server/groups.ts`, qui renvoie un
`GroupOpResult` (`{ ok: false, status, error }`) à rendre tel quel.
