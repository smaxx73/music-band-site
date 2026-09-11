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
api/sessions/+server.ts
api/sessions/[id]/+server.ts
api/sessions/[id]/reorder/+server.ts
api/songs/+server.ts
api/songs/[id]/+server.ts
api/recordings/[id]/+server.ts
api/comments/+server.ts
api/comments/[id]/reactions/+server.ts
api/notifications/+server.ts
api/notifications/[id]/+server.ts
api/playlists/+server.ts
api/playlists/[id]/+server.ts
api/playlists/[id]/items/+server.ts
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

Les notifications font exception au scope habituel : elles appartiennent à un destinataire.
Le filtre `user_id = locals.user.id` **est** la vérification de droit — personne, admin compris,
ne marque la notification d'un autre. Une notification d'autrui répond `404`, pas `403`.
`PATCH /api/notifications` marque tout comme lu dans le groupe actif ;
`PATCH /api/notifications/[id]` porte `{ read: true | false }`.

Ne jamais réécrire ces règles à la main : utiliser les helpers de `src/lib/types.ts`, et pour
les membres d'un groupe passer par `src/lib/server/groups.ts`, qui renvoie un
`GroupOpResult` (`{ ok: false, status, error }`) à rendre tel quel.
