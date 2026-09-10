## Project Configuration

- **Language**: TypeScript
- **Package Manager**: pnpm
- **Add-ons**: none

---

# CLAUDE.md — Band Rehearsal App

Application web privée pour partager les enregistrements de répétitions d'un groupe de musique.
Accès restreint par comptes individuels. Les contenus sont isolés par groupe actif ; le référentiel de
morceaux est géré par tout membre du groupe actif. Chaque groupe a ses propres administrateurs
(`user_groups.role`), qui gèrent ses membres, son nom et la suppression du contenu d'autrui ; les admins
globaux (`users.role`) gèrent en plus les comptes et les groupes eux-mêmes. Voir « Rôles et droits ».

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
- Cookie signé pour l'auth, mots de passe individuels hashés en base
- Docker Compose (app + postgres + caddy) avec HTTPS automatique

## Commandes
```bash
npm run dev                          # dev local
docker compose up --build            # stack complète
docker compose logs -f app           # logs app
docker compose exec db psql -U band -d bandapp   # accès BDD
docker compose up --build app        # rebuild app seule

# Appliquer une migration (dev et prod — même commande)
docker compose exec -T db psql -U band -d bandapp < migrations/006_calendar.sql
# Remplacer le nom du fichier par la migration à appliquer.
# Les migrations sont cumulatives et numérotées ; les appliquer dans l'ordre.
```

IMPORTANT (Claude) : dès qu'un changement ajoute un fichier dans `migrations/` ou modifie
`schema.sql`, avertir explicitement l'utilisateur qu'une migration doit être appliquée en
déploiement (dev et prod), avec la commande exacte à lancer. Ne jamais laisser deviner.

## Variables d'environnement (.env, ne jamais commiter)
```
DATABASE_URL=postgresql://band:secret@db:5432/bandapp
AUDIO_DIR=/data/audio
AUTH_SECRET=chaine_aleatoire_pour_cookies
NODE_ENV=production
```

## Règles absolues
- IMPORTANT : ne jamais charger un fichier audio en mémoire Node entièrement
- IMPORTANT : le calcul du `take` doit se faire dans une transaction
- IMPORTANT : les morceaux avec statut `abandonne` n'apparaissent pas dans le sélecteur d'upload
- IMPORTANT : toutes les données groupe-scopées doivent être filtrées par `locals.user.current_group_id`
- IMPORTANT : toute décision de droit passe par les helpers de `src/lib/types.ts`
  (`canManageGroup`, `canAssignGroupAdmin`, `canDeleteGroupContent`) — jamais par une
  comparaison de rôle écrite à la main, pour que l'écran et l'API appliquent la même règle
- IMPORTANT : les opérations sur les membres d'un groupe passent par `src/lib/server/groups.ts`,
  jamais par un `INSERT`/`UPDATE`/`DELETE` direct sur `user_groups`
- Ne jamais exposer de mot de passe ou hash de mot de passe dans le code client ou les logs
- `$lib/server/` ne doit jamais être importé dans un composant client
- WaveSurfer.js doit être importé dynamiquement (`import()`) — accès à `window`
- En production, Caddy sert les fichiers audio directement depuis `/audio/` — pas Node

## Rôles et droits

Deux axes indépendants, à ne pas confondre :

| Colonne | Valeurs | Portée |
|---|---|---|
| `users.role` | `user` / `admin` / `superadmin` | toute la plateforme |
| `user_groups.role` | `member` / `admin` | un groupe donné |

- **member** — tout le contenu de son groupe actif : sessions, prises, morceaux, playlists,
  commentaires, agenda. Ne supprime que les sessions et les prises dont il est l'auteur.
- **admin de groupe** — en plus, sur SON groupe : ajouter/retirer des membres, renommer le
  groupe, supprimer les sessions et prises créées par d'autres.
- **admin global** — tout ce qui précède sur tous les groupes, plus la création de groupes
  et la gestion des comptes `user`.
- **superadmin** — en plus, seul à pouvoir gérer les comptes `admin`/`superadmin`, à attribuer
  ou retirer le rôle d'admin de groupe, et à **supprimer un groupe**.

Le rôle d'admin de groupe s'attribue depuis `/admin/groups/[id]` (superadmin uniquement).
Un admin de groupe gère son groupe depuis `/group`, sans accès à `/admin`.

La suppression d'un groupe vit dans la « zone dangereuse » en bas de `/admin/groups/[id]` :
sauvegarde à télécharger d'abord (archive JSON du groupe ou dump SQL complet), impact chiffré
affiché, saisie du nom exigée, puis cascade complète (contenu + fichiers audio). Irréversible.

## Navigation
```
/                   tableau de bord (5 dernières sessions + playlists)
/sessions           liste des sessions + création
/sessions/[id]      détail session → morceaux groupés → prises
/songs              liste + gestion du référentiel de morceaux (tout membre du groupe actif)
/songs/[id]         historique d'un morceau toutes sessions confondues
/recording/[id]     lecteur waveform + commentaires
/playlists/[id]     lecture en continu d'une playlist
/upload             formulaire d'upload
/profile            infos du compte connecté + changement de mot de passe
/group              infos + membres du groupe actif (consultation pour tout membre,
                    gestion des membres et du nom pour l'admin du groupe)
/admin/users        gestion des comptes
/admin/groups       gestion des groupes et membres
/agenda             agenda partagé du groupe (indisponibilités + toutes les sessions)
```

## Non implémenté — ne pas inventer
- Notifications email
- Pagination (à faire quand > 50 éléments)
- Suppression / édition de commentaires
- Tests automatisés
- Recherche full-text
