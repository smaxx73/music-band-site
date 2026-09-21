## Project Configuration

- **Language**: TypeScript
- **Package Manager**: pnpm
- **Add-ons**: none

---

# CLAUDE.md — Band Rehearsal App

Application web privée pour partager les enregistrements de répétitions d'un groupe de musique.
Accès restreint par comptes individuels. Les contenus sont isolés par groupe actif ; le référentiel de
morceaux est géré par tout membre du groupe actif. Chaque groupe a ses propres administrateurs
(`user_groups.role`), qui gèrent ses membres, son nom, son logo et ses liens (YouTube, Facebook,
Instagram) et la suppression du contenu d'autrui ; les admins
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
- IMPORTANT : un fichier déposé mais pas encore validé (import à découper) ne va JAMAIS dans
  `AUDIO_DIR` — ce dossier est celui des prises validées, exposé sous `/audio/`, où l'accès
  s'autorise par l'id de la prise. Un fichier que personne n'a validé n'y a pas d'identité et
  rien à y faire. Voir `src/lib/server/imports.ts`
- IMPORTANT : sur un import à découper, on analyse et on préécoute le proxy léger, mais le
  rendu final est TOUJOURS taillé dans l'original conservé — jamais dans le proxy
- IMPORTANT : toutes les données groupe-scopées doivent être filtrées par `locals.user.current_group_id`
- IMPORTANT : le groupe actif ne s'écrit qu'avec `setActiveGroupCookie`
  (`src/lib/server/group-scope.ts`) — jamais par un `cookies.set('band_group', …)` écrit à la
  main, dont les attributs finiraient par diverger d'un point d'écriture à l'autre
- IMPORTANT : une page de détail groupe-scopée appelle `retargetActiveGroup` avant son `404`,
  pour qu'un lien reçu visant un autre groupe du membre bascule au lieu d'échouer. La bascule
  n'écrit le cookie que sur une vraie navigation (`isDataRequest` faux) : les liens sont
  préchargés au survol, et un survol ne doit rien changer
- IMPORTANT : toute décision de droit passe par les helpers de `src/lib/types.ts`
  (`canManageGroup`, `canAssignGroupAdmin`, `canDeleteGroupContent`) — jamais par une
  comparaison de rôle écrite à la main, pour que l'écran et l'API appliquent la même règle
- IMPORTANT : les opérations sur les membres d'un groupe passent par `src/lib/server/groups.ts`,
  jamais par un `INSERT`/`UPDATE`/`DELETE` direct sur `user_groups`
- Ne jamais exposer de mot de passe ou hash de mot de passe dans le code client ou les logs
- `$lib/server/` ne doit jamais être importé dans un composant client
- WaveSurfer.js doit être importé dynamiquement (`import()`) — accès à `window`
- IMPORTANT : `/audio/` passe TOUJOURS par Node, qui vérifie la session et le groupe actif
  avant d'ouvrir le fichier. Caddy proxyfie ce chemin, il ne le sert pas : une règle
  `file_server` sur `AUDIO_DIR` rendrait chaque prise publiquement téléchargeable, hors
  authentification et hors cloisonnement par groupe. Voir `deploy.md`
- IMPORTANT : un commentaire porte sur UNE cible — une prise (`recording_id`) ou une
  setlist (`setlist_id`), jamais les deux ni aucune (contrainte `comments_target`). Tout
  code qui lit ou écrit un commentaire passe par `src/lib/server/comments.ts`
  (`commentsWithReactions`, `findCommentThread`, `commentThread`) : c'est la cible qui dit
  à quel groupe le commentaire appartient. Voir « Setlists » dans docs/features.md
- IMPORTANT : l'espace perso (`personal_recordings`) n'est PAS groupe-scopé : il appartient
  à son propriétaire, filtré par `user_id = locals.user.id` — admins compris, personne d'autre
  ne le lit. Ses fichiers sont dans `AUDIO_DIR/perso/`, servis par `/audio/perso/` (Node),
  qui n'ouvre qu'au propriétaire ou à un membre du groupe actif où l'enregistrement est
  publié. Passer par `src/lib/server/personal.ts`. Voir « Espace personnel » dans docs/features.md
- Un commentaire peut aussi viser une publication (`post_id`) : c'est la troisième cible de
  `comments_target`
- Une prise peut n'avoir qu'une vidéo YouTube, sans fichier : tout code qui touche à `AUDIO_DIR`,
  au lecteur audio partagé ou aux playlists vérifie `file_path IS NOT NULL`. Voir « Prises vidéo
  YouTube » dans docs/features.md

## Rôles et droits

Deux axes indépendants, à ne pas confondre :

| Colonne | Valeurs | Portée |
|---|---|---|
| `users.role` | `user` / `admin` / `superadmin` | toute la plateforme |
| `user_groups.role` | `member` / `admin` | un groupe donné |

- **member** — tout le contenu de son groupe actif : sessions, prises, morceaux, playlists,
  setlists, publications, commentaires, agenda. Ne supprime que les sessions, les prises,
  les setlists et les publications dont il est l'auteur. Seul à voir son espace perso.
- **admin de groupe** — en plus, sur SON groupe : ajouter/retirer des membres, renommer le
  groupe, changer son logo et ses liens réseaux, supprimer les sessions, prises, setlists
  et publications créées par d'autres.
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
/                   tableau de bord (3 dernières sessions + playlists)
/fil                fil d'actualité complet du groupe actif, par pages
/sessions           liste des sessions + création
/sessions/[id]      détail session → morceaux groupés → prises
/songs              liste + gestion du référentiel de morceaux (tout membre du groupe actif)
/songs/[id]         historique d'un morceau toutes sessions confondues
/recording/[id]     lecteur waveform + commentaires (`?t=1:23` ouvre au repère,
                    `#comment-<id>` cible un commentaire)
/playlists/[id]     lecture en continu d'une playlist
/setlists           liste des setlists + création
/setlists/[id]      programme d'une setlist : morceaux ordonnés, durée totale, commentaires
/upload             formulaire d'upload (fichier audio ou vidéo YouTube)
/record             enregistrement en direct (micro, interface audio), classé après coup
/upload/decoupe/[id] découpe automatique d'un enregistrement long sur les blancs
/profile            infos du compte connecté + changement de mot de passe
/group              infos + membres du groupe actif (consultation pour tout membre,
                    gestion des membres, du nom, du logo et des liens pour l'admin du groupe)
/admin/users        gestion des comptes
/admin/groups       gestion des groupes et membres
/agenda             agenda partagé du groupe (indisponibilités + toutes les sessions)
/perso              espace personnel : enregistrements à soi, non partagés + publication
/perso/[id]         un enregistrement perso : lecteur, titre, note, publications
/posts/[id]         une publication dans le groupe : lecteur ou suggestion + commentaires
```

Les pages de contenu sont des permaliens destinés à être partagés entre membres : la
destination survit à la connexion (`?redirectTo=`) et un lien vers un autre de ses groupes
bascule le groupe actif au lieu de répondre « introuvable ». Voir « Partager un lien vers du
contenu » dans docs/features.md.

Les notifications d'activité n'ont pas de route : elles vivent dans la cloche de la barre
du haut, alimentée par `src/lib/server/notifications.ts`. Voir « Notifications d'activité »
dans docs/features.md.

## Non implémenté — ne pas inventer
- Notifications email (les notifications d'activité, elles, existent — voir docs/features.md)
- Purge / archivage des notifications
- Pagination (à faire quand > 50 éléments) — seul le fil d'actualité (`/fil`) est paginé,
  par curseur : voir « Fil d'actualité » dans docs/features.md
- Suppression de commentaires (l'édition, elle, existe — voir docs/features.md)
- Tests automatisés
- Autres outils d'amélioration audio (normalisation, fondus, réduction de bruit) : seule
  la découpe sur les blancs existe — voir docs/features.md
- Score de confiance par coupure, et seuil de silence déduit du bruit de fond : différés
  volontairement, ils se règlent sur des fichiers réels et non a priori
- Waveform zoomable avec marqueurs déplaçables : la retouche des bornes se fait au clavier
  et au bouton (±0,5 s / ±5 s, couper, fusionner)
- Recherche full-text
- Partage hors du groupe : aucun lien public ni lien à jeton. Tout lien exige un compte et
  l'appartenance au groupe du contenu — voir « Partager un lien vers du contenu » dans
  docs/features.md
