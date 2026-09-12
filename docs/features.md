# Comportements attendus par feature

## Upload d'une prise

1. Sélection de la **session** (existante ou création à la volée) et du **morceau**
   (liste depuis `songs` où `status != 'abandonne'`)
2. Réception multipart : fichier audio + `session_id`, `song_id`
3. Validation : MIME audio autorisé via `audio_formats`, taille < 200 Mo, session et morceau dans le groupe actif
   (réception multipart commune à l'upload et aux imports : `src/lib/server/upload-stream.ts`)
4. Streaming du fichier brut vers un fichier temporaire et calcul SHA-256 sans charger l'audio en mémoire
5. Détection de doublon dans le groupe actif via `recordings.file_hash` ; retour `409` avec les informations de la prise existante si doublon
6. Conversion ffmpeg → mp3 128kbps + suppression silence début/fin
7. Extraction durée via ffprobe
8. Calcul du `take` dans une transaction :
   `SELECT COALESCE(MAX(take), 0) + 1 FROM recordings WHERE session_id=$1 AND song_id=$2`
9. Insertion en base avec `file_hash` et `source_file_name` (le nom du fichier tel que
   déposé, conservé pour l'affichage seul — le fichier sur disque, lui, est toujours
   nommé depuis l'id de la prise), sauvegarde `/data/audio/{id}.mp3`, retour du
   `recording` créé

## Découpe automatique d'un enregistrement (`/upload/decoupe/[id]`)

Premier des outils d'amélioration audio branchés à la suite de l'upload.

- Case **« Ce fichier contient plusieurs prises »** sur `/upload`. Le morceau ne se
  choisit alors pas dans le formulaire : il se choisit segment par segment, après analyse
- Le fichier part en **zone de transit** (`audio_imports`) et y attend d'être découpé.
  **Rien n'entre dans `recordings`** avant validation
- **L'original est conservé intact** : c'est dans lui que les prises seront taillées, et il
  n'est transcodé qu'une seule fois, à la découpe. Tout le travail — détection des blancs,
  forme d'onde, préécoute — se fait sur un **proxy** léger (mono 22 kHz, 48 kbps, ~30×
  plus petit), qu'il serait absurde de payer au tarif de l'original à chaque relance
  d'analyse ou pour une écoute de cinq secondes
- Proxy et original partagent la **même échelle de temps** : le proxy n'est jamais rogné
  (contrairement à `convertToMp3`), et le délai d'encodage mp3 est décrit par l'en-tête
  LAME puis retiré au décodage. Une borne trouvée sur le proxy vaut telle quelle dans
  l'original — vérifié à 20 µs près
- Les octets ne sont **jamais** dans `AUDIO_DIR` : en production Caddy sert ce dossier tel
  quel sous `/audio/`, sans passer par Node ni par l'authentification. Un fichier que
  personne n'a validé n'a rien à y faire — il vit dans le répertoire temporaire du conteneur
- Un import est **personnel** : seul son déposant le voit, et seulement dans le groupe où
  il l'a déposé. Rien n'est encore publié, personne d'autre n'a à le voir
- Détection des blancs par `silencedetect` (`src/lib/server/ffmpeg.ts`). Le complémentaire
  des silences, ce sont les prises. Chaque segment retrouve 0,25 s de part et d'autre :
  le seuil mange sinon l'attaque d'une note et la fin d'une résonance
- Réglages par défaut : silence ≥ 2 s sous −40 dB, prise ≥ 10 s, marge 0,25 s. Quatre
  curseurs permettent de **relancer l'analyse** sans renvoyer le fichier — il est déjà sur
  le serveur. Relancer remet à zéro les morceaux choisis et les retouches, l'écran le dit
- La **marge conservée** est bornée à la moitié du blanc de chaque côté : deux segments
  voisins ne peuvent donc jamais se recouvrir. Au-delà de cette limite, la marge revient
  exactement à couper au centre du blanc
- L'écran affiche la forme d'onde du fichier entier avec les segments en surimpression,
  et pré-écoute chaque segment depuis un seul élément `<audio>` (déplacement, pas découpe)
- Chaque segment retenu reçoit **son propre morceau** ; les autres sont écartés (bavardage,
  fausse note, bruit de salle). Un segment retenu sans morceau bloque la validation
- **Préécoute ciblée** : cliquer une borne joue 5 s avant et 5 s après, ce qui valide une
  coupure sans réécouter le morceau. Un seul élément `<audio>` sur le proxy — on s'y
  déplace, on ne demande pas d'extrait au serveur
- **Retouche à la main** (bouton « Ajuster ») : déplacer une borne de ±0,5 s ou ±5 s,
  **couper un segment en deux** à la position de lecture, **fusionner avec le suivant**.
  Une borne ne peut pas mordre sur le segment voisin ni descendre sous 1 s de longueur ;
  tout l'espace du blanc, lui, est disponible. Après une coupe manuelle, la moitié droite
  repart sans morceau : c'est le choix que l'utilisateur vient de dire vouloir faire
- Pas de waveform zoomable ni de marqueurs déplaçables à la souris : la retouche numérique
  couvre le même besoin sans dépendre de la résolution de la forme d'onde, et fonctionne
  au doigt sur téléphone
- Toutes les prises issues d'une découpe portent le **nom du fichier importé** : elles
  viennent réellement du même enregistrement, et c'est cela qu'on cherche à retrouver plus
  tard — le numéro du segment, lui, est déjà le `take`
- À la validation : un extrait par segment, taillé **dans l'original** et encodé aux
  réglages de stockage de l'application (mp3 128 kbps) — un seul encodage sur tout le
  chemin d'une prise. Puis création dans **une seule transaction** : les segments d'un
  même morceau se numérotent à la suite, sans trou ni collision
- Les fichiers sont taillés **avant** l'écriture en base, et posés dans `AUDIO_DIR` ensuite :
  un fichier orphelin se rattrape, une ligne pointant vers un fichier absent non.
  Si quoi que ce soit échoue, les prises déjà insérées repartent et l'import redevient découpable
- L'import est **réclamé** (`consumed_at`) avant tout travail : un double envoi ne crée pas
  deux séries de prises. Un import déjà découpé répond `409`
- Une notification par prise créée, comme pour un upload simple

### Reprise d'une découpe

- **Une découpe validée ne détruit pas l'original** : il reste **7 jours**. S'apercevoir à
  la répétition suivante qu'un segment en contenait deux ne doit pas obliger à renvoyer un
  fichier de 200 Mo
- `/upload` liste les fichiers encore disponibles : « Reprendre » pour une découpe en
  attente, « Refaire la découpe » pour une déjà validée (`POST /api/imports/[id]/redo`,
  qui remet `consumed_at` à NULL)
- La liste ne montre que les imports dont l'original existe **vraiment** sur disque : une
  ligne peut survivre à ses octets, la zone de transit vivant dans le répertoire temporaire
  que la recréation du conteneur emporte. Proposer de reprendre un fichier absent n'offrirait
  qu'un bouton qui échoue
- Les prises déjà créées **ne sont pas supprimées** : une partie est en général bonne, et
  on ne défait rien dans le dos de l'utilisateur. À lui d'écarter celles qu'il ne garde pas
- Abandon explicite depuis l'écran de découpe : ligne et octets partent tout de suite.
  Sinon les imports de plus de 7 jours sont balayés au dépôt suivant — une seule règle,
  découpe validée ou non, et pas de tâche planifiée pour un volume aussi faible

## Liste des sessions (`/sessions`)

- Liste des sessions du groupe actif, triées par date décroissante
- Bouton [+ Nouvelle session] → modale de création (type, date, titre, lieu, membres, notes)
- La création passe par `POST /api/sessions` et crée l'événement d'agenda lié
- **Participants** : la modale s'ouvre avec **tous les membres du groupe actif** déjà présents — c'est
  le cas courant, on retire les absents plutôt que de retaper les présents. Chaque nom est une
  vignette supprimable d'un clic ; un membre retiré se repropose sous le champ pour être remis
- Un nom **hors du groupe** (remplaçant, invité) s'ajoute librement au clavier : les participants
  d'une session sont du texte (`sessions.members`), jamais des comptes

## Vue session (`/sessions/[id]`)

- Prises groupées par morceau, triées par `take` ASC
- Chaque morceau : toutes ses prises + qualité + nombre de commentaires
- Modification possible : date, type, titre, lieu, notes, membres de la session
  (mêmes vignettes qu'à la création — `src/lib/components/MembersInput.svelte`)
- Modification possible par prise : qualité libre, notes. La qualité se règle uniquement dans cette vue ; l'historique d'un morceau est en lecture seule.
- Ajout d'une prise oubliée à une session passée : autorisé
- Chaque prise affiche le **nom du fichier déposé** (`recordings.source_file_name`), tronqué
  dans la colonne et donné en entier au survol : `file_path` vaut toujours `{id}.mp3`, unique
  mais muet sur la provenance. Les prises antérieures à la migration 023 n'ont pas de nom
  d'origine — il n'a jamais été écrit — et retombent sur `{id}.mp3`, en italique grisé
- Le compteur de commentaires d'une prise est cliquable : il déplie la liste des commentaires
  sous la ligne, chargée à la demande via `GET /api/comments?recording_id=`, sans ouvrir le lecteur
- Mode édition : suppression de prise, déplacement dans l'ordre du morceau, puis renumérotation persistée
- Suppression d'une prise : réservée à celui qui l'a uploadée et aux admins du groupe.
  Le bouton n'apparaît pas aux autres membres, et l'API répond `403`
- Suppression d'une session : réservée à son créateur et aux admins du groupe.
  Supprime la session, ses prises en cascade et les fichiers audio associés
- Une prise ou une session dont l'auteur n'a pas pu être relié à un compte (contenu antérieur
  à la migration 018) n'est supprimable que par un admin du groupe

## Vue morceau (`/songs/[id]`)

- Toutes les prises de ce morceau, toutes sessions confondues
- Triées par date de session décroissante
- Objectif : visualiser l'évolution du morceau dans le temps
- Les prises affichent leur libellé de qualité libre et le nom du fichier déposé
- Le compteur de commentaires déplie la liste des commentaires de la prise, sans ouvrir le lecteur

## Lecteur audio (`/recording/[id]`)

- WaveSurfer.js initialisé dans `onMount`, importé dynamiquement
- URL audio : `/audio/{recording_id}.mp3` (Caddy en production, Node seulement en dev)
- Commentaires avec `timestamp_s` → marqueurs sur la waveform
- Clic sur un marqueur → seek à ce timestamp + scroll vers le commentaire
- Contrôles : ⏮ retour début | ▶/⏸ | ⏭ +10s | temps courant/total | volume
- Ajout de commentaire : global OU ancré à la position courante du lecteur
- La case "ancrer au timestamp" est cochée par défaut si le lecteur est en pause
- Auteur pré-rempli depuis l'utilisateur connecté
- Le nom du fichier déposé figure sous la ligne de métadonnées de la prise

## Réactions aux commentaires

- Chaque membre peut réagir à un commentaire par 👍 ou 👎, depuis le lecteur comme depuis
  les listes dépliées des vues session et morceau
- Une seule réaction par membre et par commentaire : cliquer l'autre pouce la remplace,
  re-cliquer le même la retire (`DELETE`)
- `POST /api/comments/[id]/reactions` avec `{ value: 1 | -1 }`, `DELETE` pour retirer ;
  les deux retournent `{ up_count, down_count, my_reaction }`
- Les compteurs affichés sont mis à jour localement, sans rechargement de page

## Playlists (`/playlists/[id]`)

- Lecture en continu : enchaînement automatique dans l'ordre `position`
- Chaque item affiche : titre du morceau, date session, numéro de prise, note
- Ordre modifiable par drag & drop → PATCH `position`
- Depuis `/recording/[id]` : bouton "Ajouter à une playlist"

## Référentiel de morceaux (`/songs`)

- Géré par tout membre du groupe actif (pas réservé aux admins) — scope toujours par `current_group_id`
- Ajout : titre (unique dans le groupe), compositeur, tonalité, statut, et en complément
  optionnel : artiste/groupe original (si reprise), année de sortie, durée de référence
- Modification possible après coup
- Statut `abandonne` → masqué dans le sélecteur d'upload, prises existantes conservées ; reste visible et modifiable dans `/songs`
- Suppression bloquée si des prises existent pour ce morceau
- Liste affiche tous les statuts du groupe actif, avec nombre de prises (`take_count`)

## Agenda partagé (`/agenda`)

- Vue mensuelle en grille 7 colonnes (lundi → dimanche), navigation mois par mois
- Chaque membre peut ajouter sur n'importe quel jour un événement :
- `indisponibilite` — indisponibilité personnelle, liée à `user_id` et sans `group_id`
- `repetition` | `concert` | `studio` | `autre` — événement de groupe, lié au groupe actif ;
  ces quatre types reflètent exactement `sessions.type`
- Toute session créée apparaît automatiquement dans l'agenda, quel que soit son type :
  `POST /api/sessions` insère l'événement lié, `PATCH` le synchronise (date, type, titre,
  notes, lieu) et `DELETE` le retire
- Un événement de groupe peut être lié à une `session` existante (optionnel)
- Chaque événement peut avoir `title`, `notes` et `location`
- Les indisponibilités affichées sont celles des utilisateurs membres du groupe actif
- Clic sur un jour → panneau détail : liste des événements du jour + formulaire d'ajout
- Badges colorés : rouge = indisponible, bleu = répétition, vert = concert, violet = studio, gris = autre
- Droits : seul l'auteur peut modifier ou supprimer son indisponibilité ; les événements de groupe sont modifiables/supprimables par les membres du groupe actif
- `author` = nom de l'utilisateur connecté

## Groupe actif (`/group`)

- Consultation pour tout membre : informations du groupe, compteurs, logo, liens vers les
  réseaux du groupe (ouverts dans un nouvel onglet), liste des membres avec leur rôle dans le groupe
- Le rôle **global** d'un membre (`users.role`) n'est affiché qu'aux admins globaux, et n'est
  pas sélectionné en base sinon — le masquer côté client le laisserait dans le payload
- Un **admin de groupe** (`user_groups.role = 'admin'`) y gère son groupe sans passer par `/admin` :
  renommer le groupe, ajouter un membre, retirer un membre, changer le logo et les liens réseaux
- Ajout **par pseudo exact**, pas par liste déroulante : un admin de groupe n'a pas à voir
  l'annuaire des comptes des autres groupes de la plateforme
- Un membre ajouté depuis `/group` l'est toujours en rôle `member`
- Le sélecteur de rôle dans le groupe n'apparaît qu'au superadmin. Un admin de groupe ne peut
  ni promouvoir un membre, ni retirer un autre admin de groupe (ce qui l'empêche aussi de se
  retirer lui-même)
- Le dernier membre d'un groupe ne peut pas être retiré : le contenu deviendrait inatteignable

## Logo et réseaux du groupe (`/group`)

- **Logo** : PNG, JPEG, WebP ou GIF, 2 Mo maximum, stocké en base (`group_logos`) pour suivre
  le groupe dans `pg_dump` et partir avec lui. Le format est lu dans les octets du fichier,
  jamais repris du navigateur ; SVG refusé (servi depuis notre origine, il pourrait exécuter du script)
- Servi par `GET /api/groups/[id]/logo`, aux seuls membres du groupe et aux admins globaux
  (`canViewGroup`) ; un non-membre reçoit `404`. L'URL porte `?v=<horodatage>` pour un cache
  navigateur long sans jamais servir un ancien logo
- Affiché à côté du nom sur `/group` et en pastille ronde dans la barre du haut (groupe actif)
- **Liens** : YouTube, Facebook, Instagram (`groups.youtube_url`, `facebook_url`, `instagram_url`).
  Saisie tolérante (« youtube.com/@groupe » est complété en https), mais le domaine doit être
  celui du réseau (sous-domaines compris, `youtu.be` et `fb.com` acceptés) et le lien doit
  mener à une page, pas à l'accueil du site. Toujours stockés en https. Champ vide = lien retiré
- Modification réservée à `canManageGroup` (admin du groupe ou admin global), via
  `src/lib/server/groups.ts` (`updateGroupLinks`, `setGroupLogo`, `removeGroupLogo`)
- L'archive JSON d'un groupe embarque le logo en base64 ; la suppression du groupe l'emporte

## Rôles dans un groupe

- `user_groups.role` vaut `member` ou `admin` et porte de vrais droits (migration 019)
- **Attribution réservée au superadmin**, depuis `/admin/groups/[id]` — un admin global peut
  gérer les membres d'un groupe mais ne peut ni nommer ni déposer un admin de groupe
- Un admin de groupe obtient, sur son groupe uniquement : gestion des membres, renommage,
  suppression des sessions et prises créées par d'autres
- Il n'obtient **aucun** accès à `/admin`, ni à un autre groupe
- Toutes ces décisions passent par `canManageGroup` / `canAssignGroupAdmin` /
  `canDeleteGroupContent` (`src/lib/types.ts`), utilisés à l'identique côté écran et côté API
- Les opérations d'appartenance passent toutes par `src/lib/server/groups.ts`

## Suppression d'un groupe (`/admin/groups/[id]`)

- **Superadmin uniquement** (`canDeleteGroup`), dans une section « Zone dangereuse » isolée
  en bas de la fiche du groupe. La liste `/admin/groups` ne propose plus de suppression.
- Déroulé en deux étapes imposées : **1. sauvegarder**, puis **2. confirmer**. Le champ de
  confirmation et le bouton restent verrouillés tant qu'aucune sauvegarde n'a été lancée
- Deux téléchargements proposés :
  - `GET /api/groups/[id]/export` — archive JSON du seul groupe (morceaux, sessions, prises,
    commentaires, playlists, agenda, membres) + **manifeste audio** (nom de fichier, taille,
    SHA-256). Ne contient **jamais** de hash de mot de passe. Superadmin uniquement
  - `GET /api/admin/backup` — dump `pg_dump` complet, le seul restaurable tel quel
- Ni l'un ni l'autre n'embarque les `.mp3` (plusieurs Go) : le manifeste sert à les archiver
  à part depuis `AUDIO_DIR` avant de lancer la suppression
- Le verrou sur la sauvegarde est un garde-fou d'**attention** : le navigateur ne signale pas
  la fin d'un téléchargement. La règle de droit, elle, est vérifiée côté serveur
- L'impact est chiffré avant confirmation : membres, morceaux, sessions, prises et **volume
  audio réel**, commentaires, playlists, événements d'agenda
- Confirmation par saisie du nom exact du groupe. Vérifiée **côté serveur** dans
  `deleteGroup()`, pas seulement par l'écran ; l'API exige le même nom en `?confirm=`
- Suppression en cascade dans une transaction, dans cet ordre imposé par les FK :
  `playlists` → `calendar_events` → `sessions` (les prises, commentaires, réactions et
  entrées de playlist tombent en cascade) → `songs` → `notifications` → `group_logos`
  → `user_groups` → `groups`
- Les fichiers `.mp3` sont supprimés **après** le commit : un fichier orphelin se rattrape,
  une ligne pointant vers un fichier disparu non
- Les **comptes utilisateurs sont conservés** — seule l'appartenance au groupe disparaît.
  Les indisponibilités personnelles (`group_id IS NULL`) ne sont pas touchées
- Opération irréversible : aucune sauvegarde n'est prise automatiquement

## Notifications d'activité

- Cloche dans la barre du haut, avec pastille du nombre de non lues du **groupe actif**
- Une notification est créée pour **chaque membre du groupe sauf l'auteur de l'action**, au
  moment de l'action (`src/lib/server/notifications.ts` → `notifyGroup`)
- Cinq déclencheurs, un par création : prise uploadée (`recording`), commentaire (`comment`),
  session (`session`), playlist (`playlist`), événement d'agenda (`agenda`, indisponibilité
  comprise). Une session crée déjà sa notification : l'événement d'agenda qu'elle génère
  n'en crée pas une seconde
- Notifier ne doit **jamais** faire échouer l'action notifiée : `notifyGroup` logue ses
  erreurs et n'en propage aucune
- Le menu offre les actions habituelles : filtre « Non lues » / « Toutes », marquer une
  notification comme lue ou non lue (pastille à droite de la ligne), tout marquer comme lu.
  Ouvrir une notification la marque lue puis navigue vers la page concernée
- Le nom de l'auteur est relu depuis `users` (`actor_name` n'est qu'un repli) : un changement
  de nom affiché se répercute sur l'historique, comme pour les commentaires
- Une notification disparaît avec le contenu qu'elle annonce (`session_id`, `recording_id`,
  `playlist_id` en `ON DELETE CASCADE`) plutôt que de pointer vers une page supprimée
- La pastille est comptée côté serveur dans `+layout.server.ts` — juste dès le premier rendu —
  puis rafraîchie par le menu toutes les 60 s tant qu'il reste fermé
- Aucune purge : la table grandit indéfiniment, à traiter quand le volume le justifiera

## Tableau de bord (`/`)

- Colonne gauche : 5 dernières sessions (date, morceaux travaillés en résumé)
- Colonne droite : flux d'actualité (sessions, playlists modifiées et **derniers commentaires**,
  triés par horodatage décroissant, chaque entrée renvoyant vers la page concernée),
  puis playlists triées par date de modification
- Bouton [+ Uploader] toujours visible en haut
