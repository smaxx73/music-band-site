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
api/playlists/+server.ts
api/playlists/[id]/+server.ts
api/playlists/[id]/items/+server.ts
api/agenda/+server.ts
api/agenda/[id]/+server.ts
api/groups/+server.ts
api/groups/[id]/+server.ts
api/groups/[id]/members/+server.ts
api/groups/switch/+server.ts
```

## Auth
Toutes les routes API vérifient le cookie `band_session`.
Si absent → `return json({ error: "Non autorisé" }, { status: 401 })`
Les routes qui manipulent du contenu partagé vérifient aussi `locals.user.current_group_id`.
