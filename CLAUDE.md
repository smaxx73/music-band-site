## Project Configuration

- **Language**: TypeScript
- **Package Manager**: pnpm
- **Add-ons**: none

---

# CLAUDE.md — Band Rehearsal App

Application web privée pour partager les enregistrements de répétitions d'un groupe de musique.
Accès restreint, tout le monde a les mêmes droits, tout le contenu est partagé.

## Références
- Schéma SQL complet : @schema.sql
- Conventions et architecture : @docs/conventions.md
- Comportements attendus par feature : @docs/features.md
- Règles spécifiques aux routes API : @src/routes/api/CLAUDE.md

## Stack
- SvelteKit (TypeScript), Node adapter (`@sveltejs/adapter-node`)
- PostgreSQL 16 via `postgres.js` — SQL brut, pas d'ORM
- Fichiers audio locaux dans `/data/audio/` (volume Docker)
- `ffmpeg` pour conversion et traitement audio
- WaveSurfer.js pour le lecteur
- Cookie signé pour l'auth (mot de passe partagé)
- Docker Compose (app + postgres + nginx) + Let's Encrypt

## Commandes
```bash
npm run dev                          # dev local
docker compose up --build            # stack complète
docker compose logs -f app           # logs app
docker compose exec db psql -U band -d bandapp   # accès BDD
docker compose up --build app        # rebuild app seule
```

## Variables d'environnement (.env, ne jamais commiter)
```
DATABASE_URL=postgresql://band:secret@db:5432/bandapp
AUDIO_DIR=/data/audio
AUTH_PASSWORD=motdepassedugroupe
AUTH_SECRET=chaine_aleatoire_pour_cookies
NODE_ENV=production
```

## Règles absolues
- IMPORTANT : ne jamais charger un fichier audio en mémoire Node entièrement
- IMPORTANT : le calcul du `take` doit se faire dans une transaction
- IMPORTANT : les morceaux avec statut `abandonne` n'apparaissent pas dans le sélecteur d'upload
- Ne jamais exposer `AUTH_PASSWORD` dans le code ou les logs
- `$lib/server/` ne doit jamais être importé dans un composant client
- WaveSurfer.js doit être importé dynamiquement (`import()`) — accès à `window`
- Nginx sert les fichiers audio directement depuis `/audio/` — pas Node

## Navigation
```
/                   tableau de bord (5 dernières sessions + playlists)
/sessions/[id]      détail session → morceaux groupés → prises
/songs/[id]         historique d'un morceau toutes sessions confondues
/recording/[id]     lecteur waveform + commentaires
/playlists/[id]     lecture en continu d'une playlist
/upload             formulaire d'upload
/admin/songs        gestion du référentiel de morceaux
```

## Non implémenté — ne pas inventer
- Notifications email
- Pagination (à faire quand > 50 éléments)
- Suppression / édition de commentaires
- Tests automatisés
- Recherche full-text
