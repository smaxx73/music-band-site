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
10. L'écran enchaîne directement sur `/recording/{id}` — lecteur et commentaires — plutôt
    que de rester sur le formulaire : c'est juste après l'ajout qu'on commente la prise.
    Idem pour une prise vidéo YouTube. Une découpe, elle, mène à `/upload/decoupe/[id]`

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
- Les octets ne sont **jamais** dans `AUDIO_DIR` : ce dossier est celui des prises validées,
  exposé sous `/audio/`, où chaque fichier s'autorise par l'id de la prise qui le porte. Un
  fichier que personne n'a validé n'a pas cet id et n'a rien à y faire — il vit dans le
  répertoire temporaire du conteneur
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

## Prises vidéo YouTube (`/upload`, source « Vidéo YouTube »)

Pour les lives déjà en ligne. **Une vidéo = un morceau = une prise.** Une prise a une piste
audio, une vidéo YouTube, ou les deux (contrainte `recordings_source`, migrations 025 et 026) :
- « a une piste audio » = `file_path IS NOT NULL` : waveform, barre du bas, playlists
- « a une vidéo » = `youtube_video_id IS NOT NULL` : lecteur YouTube sur la page de la prise

- **Rien n'est téléchargé depuis YouTube** : la prise stocke l'identifiant de la vidéo
  (`youtube_video_id`, jamais l'URL saisie) et son titre (`youtube_title`, via oEmbed)
- Ajout depuis `/upload` : session et morceau comme pour un fichier, puis la source
  « Vidéo YouTube ». Le lien est reconnu sous toutes ses formes (`watch?v=`, `youtu.be/`,
  `live/`, `shorts/`, `embed/`) et un aperçu s'affiche pour vérifier la vidéo
- **Piste audio facultative** : le son de la même prestation, déposé en fichier. Avec elle, la
  prise suit exactement le chemin d'un upload (`POST /api/upload` + champ `youtube_url` :
  conversion, doublon par hash, durée ffprobe) et devient jouable dans le lecteur audio et les
  playlists. Sans elle, `POST /api/youtube` ; la durée vient alors du lecteur d'aperçu, YouTube
  ne la donnant pas au serveur sans clé d'API
- La vidéo est vérifiée **avant** la conversion : oEmbed répond « privée ou intégration
  désactivée » → `400` ; YouTube injoignable depuis le serveur ne bloque pas l'ajout
- Doublon : la même vidéo déjà présente dans le groupe actif → `409`
- La découpe (« plusieurs prises ») ne s'applique pas à une vidéo
- La vidéo doit être **publique ou non répertoriée** : l'authentification de l'application ne
  la protège pas, et une vidéo privée ne s'intègre pas
- `/recording/[id]` : avec les deux, onglets **Audio** (par défaut : c'est la piste que jouent
  la barre du bas et les playlists) et **Vidéo**. Vidéo seule : le lecteur YouTube directement
  (`youtube-nocookie.com`, script chargé à la demande), avec une barre de progression qui porte
  les marqueurs de commentaires. Lancer l'un des lecteurs met l'autre en pause
- Avec les deux, la page pilote seule sa prise : la barre du bas reste masquée sur les deux
  onglets (elle y rejouerait la même prise en double, et l'ancrage des commentaires suit le
  lecteur affiché), et passer à l'onglet Vidéo met l'audio en pause. Une vidéo seule laisse
  la barre du bas telle quelle, avec la prise écoutée ailleurs
- Les commentaires horodatés sont communs aux deux lecteurs. La conversion retire le blanc
  initial de la piste audio : un repère peut donc différer de quelques secondes entre l'audio
  et la vidéo
- Vues session et morceau : 🎬 devant le nom signale une vidéo. Sans piste audio, « 🎬 Voir »
  ouvre la page de la prise ; avec, l'écoute dépliable fonctionne comme pour toute prise
- Playlists : seules les prises avec piste audio y entrent (`400` sinon, bouton masqué)
- Si la vidéo est recoupée dans YouTube Studio, les repères se décalent côté vidéo sans qu'on
  puisse le détecter ; si elle est supprimée ou rendue privée, le lecteur l'affiche
- Suppression d'une prise, d'une session ou d'un groupe : seul le fichier audio éventuel est
  effacé, la vidéo reste sur YouTube. Le volume audio et le manifeste d'archive ne comptent
  que les prises avec piste audio

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
- Modification possible par prise : la **qualité libre**, et elle seule. Elle se règle
  uniquement dans cette vue ; l'historique d'un morceau est en lecture seule. La note d'une
  prise, elle, s'écrit dans le lecteur — voir « Note d'une prise »
- Récapitulatif sous l'en-tête : nombre de morceaux, de prises et durée totale enregistrée
- Ajout d'une prise oubliée à une session passée : autorisé. « + Ajouter une prise » ouvre
  `/upload?session_id=` avec la session déjà sélectionnée (ignoré si hors du groupe actif)
- Une prise est une **ligne-carte**, pas une ligne de tableau (`RecordingRow.svelte`,
  partagé avec la vue morceau) : rang du haut pour ce qui identifie et ce qui agit
  (n° de prise, durée, qualité, note, commentaires, écoute, et sous 640 px le menu ⋮), rang
  du bas en gris pour la provenance (fichier, déposant). Les rangs se replient seuls quand
  la place manque — il n'y a plus de largeur en dessous de laquelle la page change de forme,
  ni de défilement horizontal. Voir « Commandes d'une prise » plus bas et « Tableaux et
  mobile » dans docs/conventions.md
- Chaque prise affiche le **nom du fichier déposé** (`recordings.source_file_name`), tronqué
  et donné en entier au survol : `file_path` vaut toujours `{id}.mp3`, unique mais muet sur
  la provenance. Les prises antérieures à la migration 023 n'ont pas de nom d'origine — il
  n'a jamais été écrit — et retombent sur `{id}.mp3`, en italique grisé
- La **qualité** est une pastille : elle ne devient un sélecteur qu'au clic. Une valeur qui
  change rarement n'a pas à occuper la largeur d'un menu déroulant sur chaque ligne
- Le compteur de commentaires d'une prise est cliquable : il déplie la liste des commentaires
  sous la ligne, chargée à la demande via `GET /api/comments?recording_id=`, sans ouvrir le lecteur
- Cette liste dépliée s'arrête aux **5 derniers** commentaires, avec « Voir les N précédents
  dans le lecteur → » : une ligne dépliée ne doit pas pousser les prises suivantes hors de
  l'écran, et une vraie discussion se lit là où on peut la réécouter
- Le tiroir déplié est un **fond creusé** (`--color-bg-subtle`) qui rejoint les bords de la
  carte. Empilés sous la ligne sur le même fond que la prise, les commentaires se donnaient
  l'air d'autres prises : ce qui les en distingue est le plateau qui les accueille, jamais
  une seconde façon de dessiner la carte
- **Une liste de commentaires se lit pareil partout** : plateau `--color-bg-subtle`, cartes
  en `--color-bg` bordées de `--color-border-light`. Vrai du tiroir d'une prise comme du
  lecteur (`.list-wrapper` de `CommentsPanel`), où le plateau sépare en plus la liste de la
  zone de saisie qui la suit. Seule la densité change (`compact`, dans le tiroir)
- Commenter une prise mène au lecteur (`/recording/[id]#commenter`) : « + 💬 » à la place du
  compteur quand la prise n'a aucun commentaire — entrée du menu ⋮ sous 640 px —, et bouton
  « 💬 Commenter dans le lecteur » en bas de la liste dépliée sinon. Ce qui clôt un tiroir
  est une action, pas une note de bas de page : sous une liste de commentaires, commenter
  est la suite naturelle et se voit comme telle. Le formulaire y est
  centré à l'écran et prend le focus — on commente mieux en réécoutant, et l'ancrage au
  timestamp n'existe que là

### Commandes d'une prise, et menu ⋮ sous 640 px

**Au-dessus de 640 px, toutes les commandes sont sur la ligne** : pastille 📝 (ou « + 📝 »
en pointillés s'il n'y a pas de note), 💬 (ou « + 💬 »), écouter ▶, ouvrir le lecteur
complet, ajouter à une playlist. La place ne manque pas, rien n'a à être caché.

**Sous 640 px**, les mêmes commandes demandent 242 px de cibles tactiles là où la carte en
offre 274 au plus : la ligne ne garde alors que ce qu'il y a **à lire** — 📝 s'il y a une
note, 💬 s'il y a des commentaires — plus l'écoute, et un menu ⋮ recueille le reste.

- **Composition stable** du menu, indépendante de ce que la prise contient déjà : ouvrir le
  lecteur complet, ajouter à une playlist, ajouter ou modifier la note, ajouter un
  commentaire. Un menu qui ne grouperait que les ajouts fondrait à une seule entrée sur une
  prise déjà annotée et commentée, et vaudrait alors moins que le bouton qu'il remplace
- Une prise **sans piste audio** n'a ni playlist ni lecteur complet dans son menu :
  « 🎬 Voir » mène déjà à sa page, et une vidéo seule n'entre pas dans une playlist
- Les deux jeux de commandes **coexistent dans le DOM**, l'un des deux en `display: none`
  selon la largeur — ce qui les retire aussi de l'arbre d'accessibilité, donc rien n'est
  annoncé deux fois. Le bouton playlist, lui, est **une seule instance** : c'est lui qui
  porte la modale, et l'entrée de menu l'ouvre par un `bind:`
- Le ⋮ ne porte **pas de cadre** : un menu de débordement n'est pas une commande de plus,
  c'est l'accès au reste. Il s'assoit au bord droit de la carte, et ne prend un fond qu'au
  survol et tant que son panneau est ouvert
- Ferme au clic extérieur et à Échap, qui rend le focus au bouton. Les écouteurs ne sont
  posés que pendant l'ouverture — une session affiche des dizaines de prises
- Le groupe de commandes **ne se scinde jamais** : il rejoint le rang de l'identité quand il
  y tient, et bascule d'un bloc au rang suivant sinon. Flexbox coupe les lignes avant de
  rétrécir, donc l'identité n'est jamais écrasée pour garder les boutons à côté
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
- Mêmes lignes-cartes que la vue session (`RecordingRow.svelte`), en lecture seule :
  la qualité s'y lit en badge, sans sélecteur, et aucune action d'édition n'y figure
- Les prises affichent leur libellé de qualité libre, le nom du fichier déposé et leur note
- Le compteur de commentaires déplie la liste des commentaires de la prise, sans ouvrir le
  lecteur — mêmes 5 derniers qu'en vue session, avec le renvoi vers le lecteur au-delà
- Même menu ⋮ qu'en vue session — voir « Menu d'une prise » plus haut

## Lecteur audio (`/recording/[id]`)

- WaveSurfer.js initialisé dans `onMount`, importé dynamiquement
- URL audio : `/audio/{recording_id}.mp3`, servie par Node, qui vérifie la session et le
  groupe actif avant d'ouvrir le fichier (Caddy proxyfie ce chemin, il ne le sert pas)
- Commentaires avec `timestamp_s` → marqueurs sur la waveform
- Clic sur un marqueur → seek à ce timestamp + scroll vers le commentaire
- Contrôles : ⏮ retour début | ▶/⏸ | ⏭ +10s | temps courant/total | volume
- Le lecteur reste collé en haut de la page tant qu'il laisse de quoi lire, et la liste peut
  suivre la lecture — voir « Naviguer dans une prise très commentée »
- Ajout de commentaire : global OU ancré à la position courante du lecteur. Le formulaire
  tient en deux lignes au repos — voir « Boîte d'ajout d'un commentaire »
- Mentions : taper `@` dans le commentaire propose les membres du groupe ; la mention insère
  leur pseudo unique (`@pseudo`) et est mise en évidence dans toutes les listes de commentaires.
  Le membre mentionné est notifié (voir « Notifications d'activité ») ; la règle de détection
  est partagée entre affichage et serveur dans `src/lib/mentions.ts`
- L'ancrage est actif par défaut si le lecteur est en pause, inactif dès qu'il joue
- Auteur pré-rempli depuis l'utilisateur connecté
- Le nom du fichier déposé figure sous la ligne de métadonnées de la prise, la note
  de la prise juste en dessous

## Partager un lien vers du contenu

Toutes les pages de contenu sont des permaliens (`/recording/12`, `/sessions/4`, `/songs/7`,
`/playlists/3`, `/setlists/5`). Trois choses les rendaient inutilisables dès qu'on les envoyait à quelqu'un.

- **La destination survit à la connexion.** Un lien reçu s'ouvre presque toujours sur une
  session expirée : la page visée est mise de côté dans `?redirectTo=` avant la redirection
  vers `/login`, et rejouée une fois connecté. Sans cela, tout lien partagé atterrissait sur
  le tableau de bord et il fallait redire de vive voix ce qu'on partageait. La valeur vient de
  l'URL, donc de n'importe qui : seul un chemin interne est accepté (`src/lib/redirect.ts`),
  un `//exemple.com` ferait du formulaire de connexion une redirection ouverte
- **Un lien vers un autre de ses groupes bascule le groupe actif.** Tout le contenu est filtré
  par `current_group_id`, gardé en cookie : un membre de deux groupes qui ouvrait un lien vers
  le groupe où il n'était pas en train de travailler recevait « introuvable », le même message
  que pour un id qui n'existe pas. La bascule a lieu dans le `load`
  (`src/lib/server/group-scope.ts`), l'URL est rejouée avec le nouveau cookie, et un bandeau
  l'annonce — le cookie étant commun aux onglets, la taire serait plus déroutant que le dire
- **Seule une vraie navigation bascule** (`isDataRequest` est faux) : coller le lien reçu,
  l'ouvrir depuis un message, revenir de la connexion. SvelteKit précharge les liens **au
  survol** (`data-sveltekit-preload-data` dans `src/app.html`) ; sans cette distinction,
  promener la souris sur un lien changerait le groupe actif de tous les onglets, sans clic.
  Une requête spéculative n'écrit rien
- Sur une requête de données — navigation interne à la SPA, préchargement — la page répond
  donc `409` avec un écran qui nomme le groupe et propose de basculer **au clic**
  (`src/routes/+error.svelte`, via `App.Error.switch_group`). Le contenu d'un groupe dont on
  n'est pas membre, lui, ne produit jamais cet écran : il reste un `404` muet
- Cette bascule ne vaut que pour **ses propres** groupes. Le contenu d'un groupe dont on n'est
  pas membre reste un `404` et jamais un `403` : « accès refusé » confirmerait l'existence de
  la prise à qui ne doit rien en savoir
- Cela vaut aussi pour les liens internes : les notifications stockent des chemins relatifs,
  et la cloche pouvait donc mener à un « introuvable » à l'intérieur de l'application

### Repère et commentaire dans l'URL

Ce qu'on partage d'une prise, c'est presque toujours un passage ou un commentaire précis.

- `?t=` ouvre le lecteur au repère : `?t=83`, `?t=1:23` et `?t=1:02:03` sont acceptés
  (`parseTimecode`, `src/lib/youtube.ts`, partagé avec la saisie d'un repère à l'édition d'un
  commentaire). Le lecteur n'a pas besoin d'être prêt : la demande est rejouée dès qu'il l'est,
  pour l'audio comme pour la vidéo YouTube
- `#comment-<id>` amène le commentaire à l'écran et le met en évidence, en dépliant d'abord les
  plus anciens s'il en fait partie — la même mécanique que les marqueurs de la waveform
- **« 🔗 Copier le lien »** sur la page de la prise reprend la position courante du lecteur :
  partager depuis 1:23 partage 1:23. Chaque commentaire a le sien, qui porte son repère **et**
  son ancre (`?t=83#comment-5000`) : le destinataire arrive au bon endroit du morceau, pas
  seulement sur la page. Aller chercher l'URL dans la barre d'adresse est la manœuvre qui
  décourage de partager, sur téléphone surtout
- Le presse-papiers demande un contexte sécurisé : s'il est refusé, le bouton le dit et l'URL
  reste atteignable depuis la barre d'adresse

Rien de tout cela ne sort du groupe : il n'existe pas de lien public ni de lien à jeton, et
`/audio/` vérifie la session et le groupe actif comme le reste. Partager, ici, veut dire
partager avec les membres du groupe.

## Naviguer dans une prise très commentée

Tout est chargé d'un coup (`commentsWithReactions`) : le nombre de commentaires d'une prise
est borné par la taille du groupe. Ce qui manquait n'était pas la pagination, mais de quoi
s'orienter dans la liste.

- **Le lecteur reste collé en haut** pendant qu'on lit : la waveform et ses marqueurs sont
  l'index de la discussion, ils n'ont pas à disparaître au premier défilement. Il ne se colle
  que s'il laisse de quoi lire (au plus 45 % de la hauteur de fenêtre) — une vidéo 16/9 sur un
  téléphone occuperait la moitié de l'écran. Les commentaires portent la marge de défilement
  correspondante (`--comment-scroll-margin`), pour qu'un commentaire visé ne finisse pas dessous
- **Commentaire courant** : le dernier commentaire ancré que la lecture a dépassé est marqué
  d'un liseré. Avec « Suivre la lecture », la liste défile toute seule d'un commentaire au
  suivant — on relit les retours au rythme où ils ont été posés. Le défilement n'a lieu qu'au
  changement de commentaire, jamais à chaque quart de seconde
- **Deux ordres** : « Chronologique » (celui de l'écriture, par défaut) et « Dans le morceau »
  (par `timestamp_s` croissant, les commentaires généraux regroupés en fin de liste sous leur
  propre libellé). Sur une prise longuement commentée, c'est le second qu'on suit en réécoutant.
  Les deux boutons n'apparaissent qu'à partir de deux commentaires ancrés
- **Les plus anciens sont repliés** au-delà de 20, derrière « ↑ Afficher les N commentaires
  précédents » : une discussion se lit par la fin, et le formulaire doit rester à portée. Le
  repli ne vaut qu'en ordre chronologique — ailleurs, « les plus anciens » ne sont pas ceux du
  haut. Viser un commentaire replié (marqueur de la waveform, suivi de lecture) déplie d'abord
- Ce repli n'est **pas** de la pagination : rien n'est rechargé, tout est déjà là

## Boîte d'ajout d'un commentaire

Neuf commentaires sur dix tiennent en une phrase : le formulaire ne doit pas occuper un
tiers de l'écran en l'attendant.

- C'est une **zone de saisie de discussion**, pas un panneau de formulaire : le cadre est le
  champ lui-même (pas de `.form-section`), et les actions tiennent sur sa droite
- **Pas de titre ni de libellé visible** : la section s'annonce déjà « Commentaires (n) », et
  le placeholder « Écrire un commentaire… (@ pour mentionner) » porte l'intitulé comme la
  règle du `@`, à l'endroit où l'on va taper. Le libellé reste dans le DOM pour les lecteurs
  d'écran (`hideLabel`)
- Le **bouton d'envoi est dans le cadre**, en rond à droite, avec la pastille d'ancrage. Ils
  sont **voisins** de la saisie, jamais posés par-dessus : le texte ne passe pas dessous et
  ils restent en bas quand la zone grandit. Cible de 34 px, portée à 40 px sous 640 px — au
  doigt, une cible de 34 px se rate
- Le bouton est **désactivé tant que le champ est vide**, et le raccourci clavier l'est avec
  lui : à vide, rien ne promet un envoi et aucune infobulle du navigateur ne se déclenche.
  L'icône ➤ porte son intitulé en `aria-label` et le raccourci en `title`
- **Deux lignes au repos**, la hauteur du texte dès qu'on écrit (`autogrow`), plafonnée à
  ~8 lignes avant défilement. Le plancher est la hauteur des `rows` demandées, mesurée avant
  toute hauteur imposée
- **Ctrl/⌘+Entrée envoie**, comme la note d'une prise et l'édition d'un commentaire. Le
  raccourci passe avant la liste de mentions : avec un modificateur, l'intention est explicite
- L'ancrage est une **pastille ⏱ 1:23**, pas une case à cocher : elle montre le repère
  **avant** qu'on l'active, et disparaît quand le lecteur n'a pas de position (l'ancrage
  retombe alors avec elle)

## Note d'une prise

`recordings.notes` : une phrase sur la prise elle-même (« reprendre l'intro, trop rapide »),
distincte des commentaires, qui sont datés et signés.

- **Elle s'écrit dans le lecteur**, comme un commentaire : on écrit sur une prise là où on
  l'écoute. Les vues session et morceau l'affichent mais ne la modifient pas
- Sous l'en-tête de `/recording/[id]` : cliquer la note l'ouvre en saisie, Ctrl/⌘+Entrée
  enregistre, Échap annule. Sans note, un « + 📝 Ajouter une note » discret la propose
- `#notes` ouvre directement la saisie, focus dans la zone de texte — comme `#commenter`.
  C'est la cible du bouton « 📝 Modifier dans le lecteur » sous la note dépliée, du
  « + 📝 » des listes et de l'entrée « Ajouter une note » de leur menu ⋮
- `PATCH /api/recordings/[id]` avec `{ notes }` ; une note vide vaut `NULL`
- Modifiable par tout membre du groupe : c'est une annotation de travail sur la prise,
  pas une parole attribuée à quelqu'un
- Dans les listes, la note tient sur une ligne tronquée sous la prise et se déplie au clic
  (pastille 📝 ou la note elle-même). Trois mots de contexte ne valent pas un clic ; une
  note longue, elle, ne doit pas déformer la ligne. Sans note, « + 📝 » prend sa place, et
  sous 640 px c'est l'entrée du menu ⋮ qui la propose
- Pas de notification : une note n'annonce pas de nouveau contenu au groupe

## Édition des commentaires

- Lien « Modifier » sous un commentaire, depuis le lecteur comme depuis les listes dépliées
  des vues session et morceau. Zone de texte sur place ; Ctrl/⌘+Entrée enregistre, Échap annule
- **Réservé à l'auteur** (`canEditComment`), admins compris : un admin peut supprimer le
  contenu d'autrui, pas lui faire dire autre chose. Un commentaire non relié à un compte
  (antérieur à la migration 018) n'est modifiable par personne. L'API répond `403` sinon
- Le texte et l'ancrage (`timestamp_s`) sont modifiables. L'ancrage accepte les secondes,
  `mm:ss` ou `h:mm:ss` et peut être supprimé pour rendre le commentaire général
- `PATCH /api/comments/[id]` avec `{ content, timestamp_s }` pose `edited_at` ; « (modifié) » s'affiche
  à côté de la date, la date de modification au survol. Les réactions sont conservées
- L'horodatage d'un commentaire **se réduit à l'heure quand il date du jour**
  (`formatDateTime`, `src/lib/date.ts`) : à la date du jour, la date n'apprend rien.
  À l'inverse, **l'année apparaît dès qu'on sort de l'année en cours** (« 17 sept. 2025,
  10:33 »), pour qu'une vieille prise ne se lise pas comme celle d'hier. L'infobulle
  « Modifié le… » garde toujours sa date (`formatDateTimeFull`) — « Modifié le 12:35 »
  ne voudrait rien dire
- Pas de notification au groupe : une modification n'annonce pas de nouveau contenu.
  Seule exception, un membre ajouté en mention par la modification est prévenu

## Liens et vidéos dans les commentaires

- Toute URL `http(s)` écrite dans un commentaire devient un lien cliquable, ouvert dans un
  nouvel onglet (`rel="noopener noreferrer nofollow"`). Le contenu reste du **texte** : il
  est découpé à l'affichage (`src/lib/comment-content.ts`), jamais interprété comme du HTML
- La ponctuation de la phrase n'entre pas dans le lien (« regarde https://… , c'est là ») et
  une parenthèse finale n'y entre que si le lien en ouvre une lui-même
- Un lien **YouTube** ajoute un lecteur sous le commentaire, sous toutes les formes déjà
  reconnues à l'upload (`parseYouTubeVideoId`). Tant qu'on n'a pas cliqué, il n'y a qu'une
  **vignette** : ni iframe, ni script YouTube, ni cookie — une liste de commentaires en porte
  parfois plusieurs. L'iframe (`youtube-nocookie.com`) n'arrive qu'au clic et démarre seule
- Le repère de départ du lien est respecté (`?t=90`, `?t=1m30s`, `?start=90`) et annoncé sur
  la vignette : un lien collé vise souvent un passage précis
- Lancer une de ces vidéos met le lecteur partagé en pause — un seul lecteur à la fois
- Trois lecteurs au maximum par commentaire ; au-delà les liens restent cliquables, sans
  vignette. La même vidéo citée deux fois n'ouvre qu'un lecteur
- Cela vaut partout où les commentaires s'affichent (`CommentList.svelte`) : lecteur, listes
  dépliées des vues session et morceau. **Rien n'est créé en base** : ces vidéos ne sont pas
  des prises, contrairement à « Prises vidéo YouTube »

## Réactions aux commentaires

- Chaque membre peut réagir à un commentaire par 👍 ou 👎, depuis le lecteur comme depuis
  les listes dépliées des vues session et morceau
- Une seule réaction par membre et par commentaire : cliquer l'autre pouce la remplace,
  re-cliquer le même la retire (`DELETE`)
- Sur ordinateur, le survol du compteur d'un pouce affiche les membres ayant posé cette
  réaction ; sur écran tactile, toucher ce compteur affiche la même liste sous le commentaire
- `POST /api/comments/[id]/reactions` avec `{ value: 1 | -1 }`, `DELETE` pour retirer ;
  les deux retournent les compteurs, les listes de votants et `my_reaction`
- Les compteurs affichés sont mis à jour localement, sans rechargement de page

## Playlists (`/playlists/[id]`)

- Lecture en continu : enchaînement automatique dans l'ordre `position`
- Chaque item affiche : titre du morceau, date session, numéro de prise, note
- Ordre modifiable par drag & drop → PATCH `position`
- Ajout d'une prise depuis trois contextes : sa page `/recording/[id]`, chaque ligne de prise
  des vues Session et Morceau, ou directement depuis la playlist (recherche par morceau/date)
- Le sélecteur indique les playlists qui contiennent déjà la prise, permet d'en créer une sans
  quitter le contexte, et empêche les doublons ; une nouvelle playlist et sa première prise sont
  créées dans la même transaction

## Setlists (`/setlists`, `/setlists/[id]`)

Le programme d'un concert ou d'une répétition : des **morceaux** du référentiel dans
l'ordre où on les jouera. C'est ce qui la sépare d'une playlist — celle-ci vise des
**prises** précises, pour réécouter ce qui a été enregistré. On ne programme pas la
prise du 12 mars, on programme « Sunny », et le jour venu on la jouera.

- Une setlist porte un **nom**, une **description**, sa **date de création** et son auteur,
  une **liste de morceaux ordonnée**, un **temps total**, et son propre espace de commentaires
- Créée par tout membre du groupe actif depuis `/setlists` ; nom, description et programme
  se modifient ensuite par tout membre, comme le reste du contenu du groupe
- **Suppression** réservée à son auteur et aux admins du groupe (`canDeleteGroupContent`) :
  le bouton n'apparaît pas aux autres et l'API répond `403`. Elle emporte le programme et
  les commentaires de la setlist, jamais les morceaux du référentiel
- Un **morceau ne figure qu'une fois** par setlist (`UNIQUE (setlist_id, song_id)`) : le
  sélecteur d'ajout marque ceux déjà programmés, et l'API répond `409`. Les morceaux
  `abandonne` ne sont pas proposés — comme au dépôt d'une prise

### Ordre et temps total

- L'ordre se change **au glisser-déposer** et **aux flèches ↑ / ↓**. Les flèches ne
  doublent pas le glisser : elles le remplacent au doigt, le drag HTML5 n'existant pas sur
  écran tactile — et une setlist se réordonne surtout depuis un téléphone, en répétition.
  Sous 640 px, la poignée disparaît plutôt que de promettre ce qu'elle ne fait pas
- Chaque changement d'ordre est persisté par `PATCH /api/setlists/[id]/items`, qui réécrit
  tout le programme dans une transaction. Les positions passent d'abord en négatif : sans
  cela, `UNIQUE (setlist_id, position)` refuserait les états intermédiaires. Même règle
  au retrait d'un morceau, qui réindexe 1, 2, 3… sans trou
- Le **temps total** ne se stocke pas : il se somme à la lecture depuis
  `songs.reference_duration_s`. Le stocker obligerait à le recalculer à chaque durée de
  référence modifiée dans `/songs`, et il serait faux entre-temps
- Les morceaux sans durée de référence sont **comptés à part**, pas pour zéro : le total
  s'affiche alors précédé de « ≈ », et un renvoi vers `/songs` dit où renseigner ce qui
  manque. Un total muet sur ce qu'il ignore se lirait comme un total exact

### Commentaires d'une setlist

- Même espace de commentaires que celui d'une prise, même composant (`CommentsPanel`) :
  réactions 👍/👎, mentions `@pseudo`, édition par l'auteur, liens et vidéos YouTube
- Une seule table : `comments` porte soit `recording_id`, soit `setlist_id`, jamais les
  deux (contrainte `comments_target`, migration 029). Une seconde table aurait dupliqué
  les réactions, les mentions et l'édition pour n'en tirer aucune différence de fond
- **Pas de repère** : une setlist ne se lit pas, il n'y a pas de position où ancrer un
  commentaire. `timestamp_s` y reste `NULL`, l'édition ne propose pas d'ancrage, et l'API
  refuse un `timestamp_s` sur une setlist
- Les commentaires disparaissent avec la setlist qu'ils discutent (`ON DELETE CASCADE`)

### Partage et notifications

- `/setlists/[id]` est un permalien comme les autres : la destination survit à la connexion,
  et un lien reçu visant un autre de ses groupes bascule le groupe actif — voir
  « Partager un lien vers du contenu »
- Une notification `setlist` à la création, une notification `comment` (ou `mention`) par
  commentaire, pour tous les membres sauf l'auteur
- Le tableau de bord reprend les setlists créées et leurs commentaires dans son flux
  d'actualité — voir « Tableau de bord »

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
- Six déclencheurs, un par création : prise uploadée (`recording`), commentaire (`comment`),
  session (`session`), playlist (`playlist`), setlist (`setlist`), événement d'agenda
  (`agenda`, indisponibilité comprise). Une session crée déjà sa notification : l'événement
  d'agenda qu'elle génère n'en crée pas une seconde
- **Mentions** (`mention`) : un membre cité par `@pseudo` dans un commentaire reçoit « t'a
  mentionné » **à la place** du « a commenté » générique, pas en plus (`notifyMentions`).
  Pseudo comparé sans casse, ponctuation finale ignorée (« @marc, »), membres actifs du
  groupe uniquement, jamais l'auteur. À l'édition d'un commentaire, seuls les membres
  **nouvellement** mentionnés sont notifiés
- Notifier ne doit **jamais** faire échouer l'action notifiée : `notifyGroup` logue ses
  erreurs et n'en propage aucune
- Le menu offre les actions habituelles : filtre « Non lues » / « Toutes », marquer une
  notification comme lue ou non lue (pastille à droite de la ligne), tout marquer comme lu.
  Ouvrir une notification la marque lue puis navigue vers la page concernée
- Le nom de l'auteur est relu depuis `users` (`actor_name` n'est qu'un repli) : un changement
  de nom affiché se répercute sur l'historique, comme pour les commentaires
- Une notification disparaît avec le contenu qu'elle annonce (`session_id`, `recording_id`,
  `playlist_id`, `setlist_id` en `ON DELETE CASCADE`) plutôt que de pointer vers une page supprimée
- La pastille est comptée côté serveur dans `+layout.server.ts` — juste dès le premier rendu —
  puis rafraîchie par le menu toutes les 60 s tant qu'il reste fermé
- Le menu est lié au groupe pour lequel il a été rendu : recréé à chaque bascule, et si un
  autre onglet a changé de groupe (cookie commun), l'API répond `409` et l'onglet se resynchronise
- Aucune purge : la table grandit indéfiniment, à traiter quand le volume le justifiera

## Tableau de bord (`/`)

- Colonne gauche : 5 dernières sessions (date, morceaux travaillés en résumé)
- Colonne droite : flux d'actualité (sessions, playlists modifiées, **setlists créées** et
  **derniers commentaires**, triés par horodatage décroissant, chaque entrée renvoyant vers la
  page concernée), puis playlists triées par date de modification
- Un commentaire y mène là où il a été écrit : la prise, ou la setlist. La requête part de
  `comments` et rejoint les deux cibles — c'est la cible qui dit à quel groupe il appartient
- Une setlist y figure à sa **création** : elle annonce ce que le groupe prépare. Sa
  modification, elle, n'apprend rien de plus au reste du groupe
- Le filtre du flux propose « Toutes / Sessions / Playlists / Setlists / Commentaires »
- Bouton [+ Uploader] toujours visible en haut
