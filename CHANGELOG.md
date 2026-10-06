# Changelog

Les versions suivent [SemVer](https://semver.org/lang/fr/), lu pour une application et non
pour une bibliothèque :

- **MAJEUR** — un déploiement qui demande plus qu'un `git pull` + migrations : variable
  d'environnement nouvelle ou renommée, migration destructive, changement d'infra
- **MINEUR** — une fonctionnalité nouvelle, avec ou sans migration
- **CORRECTIF** — une correction, sans changement de comportement attendu

Chaque version liste les migrations qu'elle apporte : ce sont elles qu'il faut appliquer
en montant de version (voir `deploy.md`).

## [Non publié]

Migration à appliquer : `046_user_profile.sql`.

- **Photo de profil** : déposée depuis `/profile`, recadrée en carré. Elle remplace les
  initiales dans la barre du haut, la barre latérale, le fil, les commentaires et la liste
  des membres. Visible des seuls membres de ses groupes (et des admins)
- **Instruments par groupe** : chacun dit, depuis son profil, ce qu'il joue dans chacun de
  ses groupes (liste usuelle proposée, saisie libre). Ils s'affichent sous son nom dans
  `/group`

## [1.5.4] — 2026-10-05

Aucune migration à appliquer.

- Notification d'un commentaire : l'ouvrir mène au commentaire lui-même, mis en évidence,
  et recharge la page même si elle est déjà ouverte — le commentaire annoncé y paraît
  sans avoir à actualiser. La lecture et la saisie en cours ne sont pas interrompues.
  Les notifications antérieures mènent toujours à la page, sans viser le commentaire

## [1.5.3] — 2026-10-03

Aucune migration à appliquer.

- Tableau de bord : « Activité récente » se bascule entre **Nouveautés** et
  **Commentaires** (les 5 derniers, seuls). Le choix est gardé dans le navigateur. Un
  commentaire mène désormais au commentaire lui-même, à son repère s'il en a un
- Fil d'actualité : vues **Tout**, **Nouveautés** et **Commentaires** (`/fil?vue=…`). Les
  commentaires y entrent, regroupés par cible et par jour en une carte qui cite les 5
  derniers et propose « Répondre »
- Commentaire d'une prise ou d'une publication : **général par défaut**, l'ancrage se
  choisit entre « ⏱ À 1:23 » et « Général » sous la zone de saisie. Le repère se fige à la
  première frappe — « Épingler à … » le recale si la lecture s'en éloigne — et se montre
  en pointillé sur la forme d'onde ou la barre vidéo pendant l'écriture

## [1.5.2] — 2026-10-03

Aucune migration à appliquer.

- Après un déploiement, un bandeau discret propose d'actualiser la page aux onglets restés
  ouverts sur l'ancienne version (vérifiée toutes les 5 min et au retour dans l'onglet)

## [1.5.1] — 2026-10-03

Aucune migration à appliquer.

- Amélioration du son, moins de calcul : une prise déjà améliorée ne se mesure plus à
  l'ouverture du lecteur (« Son amélioré » s'affiche aussitôt, la mesure attend
  « Comparer »), et une même mesure ou une même forme d'onde demandée deux fois à la fois
  ne se calcule qu'une fois
- Un aperçu par réglage essayé : revenir à des réglages déjà écoutés, rouvrir la fenêtre
  ou garder la version écoutée ne refait aucun rendu, et l'écoute reprend au même endroit.
  6 aperçus au plus par prise, balayés au bout d'un jour. Revenir à l'original garde la
  version améliorée parmi les aperçus si elle date du démarrage en cours du serveur
- Au démarrage, le serveur mesure d'avance, en priorité basse, les prises non améliorées
  sans mesure à jour : plus d'attente à leur première ouverture. Le premier déploiement
  mesure toutes les prises existantes une fois
- « Télécharger le fichier audio » (MP3) dans le menu « Partager » d'une prise, sur sa page
  comme sur sa ligne : le fichier est nommé d'après le morceau et la prise
  (`/audio/{id}.mp3?download`)
- Lecteur : un flux audio interrompu (réseau coupé, lecture qui cale) se reprend seul, à la
  même position, sans relancer une pause voulue (`src/lib/audio-reconnect.ts`)

## [1.5.0] — 2026-10-03

Migration à appliquer : `045_recording_enhancement.sql`.

- Amélioration du son d'une prise : coupe-bas léger, égalisation, compression douce,
  grave allégé, normalisation à −14 LUFS et limiteur, réglés sur la mesure de l'original.
  Proposée sous le lecteur quand la mesure le justifie (son faible, très fort, étouffé,
  grave trop présent, grands écarts de volume), écoutée en comparaison avant d'être
  gardée. Égalisation (aucune, douce, franche), grave et compression se choisissent prise
  par prise, le module proposant les siens ; les réglages d'une prise se reprennent sur
  les autres prises de la session. Réversible : l'original reste à côté
  (`{id}.original.mp3`), compte dans le volume du groupe et figure au manifeste de
  l'archive d'un groupe

## [1.4.0] — 2026-10-02

Aucune migration à appliquer. `schema.sql` ne change que par ses commentaires.
`scripts/fix-single-channel.mjs` est facultatif : il corrige les fichiers déjà stockés
dont un seul canal porte le son (voir `deploy.md`).

- Un enregistrement dont un seul canal porte le son (micro branché sur une seule entrée
  de la carte son) est recopié sur les deux canaux à la conversion : upload, espace perso,
  enregistrement en direct et découpe. `scripts/fix-single-channel.mjs` corrige les
  fichiers déjà stockés (voir `deploy.md`). Aucune migration
- Débit relevé de 128 à 192 kbit/s, pour l'enregistrement en direct comme pour les mp3
  stockés (dépôt, espace perso, découpe). Les fichiers existants restent à 128 kbit/s ;
  un enregistrement en direct s'arrête désormais vers 2 h 20 (limite de 200 Mo)
- Feuille de répétition : la page s'ouvre en lecture (feuille seule, transposable et
  imprimable) ; « Modifier » ouvre l'atelier, « Enregistrer » ou « Annuler » y ramènent.
  Une feuille neuve part des paroles et accords déjà saisis dans la fiche du morceau, et
  « Reprendre la fiche du morceau » les réinsère dans une feuille commencée. Un lien vers la
  feuille d'un autre de ses groupes bascule le groupe actif. Aucune migration
- Page d'un morceau : « Modifier » ouvre sa fiche sous l'en-tête (titre, statut, tonalité,
  reprise, paroles et accords, recherche Deezer), comme sur une session, sans repasser par
  le tableau de `/songs`. Un morceau sans prise s'y supprime aussi
- Fiche d'un morceau : « Composition du groupe » ou « Reprise » se choisit en tête du
  formulaire. Une composition demande seulement qui l'a écrite (facultatif : vide, c'est le
  groupe) ; une reprise exige l'artiste original et propose la recherche Deezer. L'en-tête
  du morceau crédite le groupe d'abord, comme un album (« The Lambda · écrit par … »,
  « The Lambda · reprise de … »). Dans une session, chaque morceau porte de même le nom
  du groupe au-dessus de son titre, plutôt que son compositeur.
  Aucune migration : une reprise reste un morceau qui a un artiste original
- Tableau de bord repensé autour de ce qui attend le membre : « À réécouter » (la dernière
  session avec du son, jouable d'un geste, ses morceaux en lien), « À venir » (la
  prochaine date en carte, avec les absents ce jour-là, puis les deux suivantes), « À toi »
  (enregistrement non envoyé, découpes en attente, morceaux « À nommer »), les 3 dernières
  lignes d'activité et « En préparation » (setlists et playlists récentes). Les compteurs
  et le filtre de l'activité disparaissent : le fil d'actualité montre le reste
- Page **Plus** (téléphone) : une section au nom du groupe actif (fil en tête, agenda,
  playlists, setlists, membres, lieux et réseaux), puis les autres groupes seulement, puis
  le compte. Le fil d'actualité se rejoint aussi depuis le pied du menu des notifications
- Notifications au téléphone : le panneau descend de la barre du haut sur toute la
  largeur de l'écran, voile et fige la page derrière lui ; toucher le voile le referme
  sans activer ce qui est dessous. Même comportement pour le panneau de « + Ajouter »

## [1.3.0] — 2026-10-02

Migrations à appliquer, dans l'ordre : `040_song_titles_per_group.sql`,
`041_score_documents.sql`, `042_share_link_token_sealed.sql`,
`043_score_documents_keep_on_account_delete.sql`, puis
`044_audio_imports_keep_on_session_delete.sql`. La première remplace l'unicité globale
des titres par une unicité dans chaque groupe, sans modifier les morceaux existants. La
deuxième ajoute les tables des feuilles de répétition et de leurs fichiers MusicXML/MXL
originaux. La troisième ajoute le jeton chiffré des liens d'écoute. Les deux dernières ne
font qu'assouplir des clés étrangères (`ON DELETE SET NULL` au lieu d'une cascade) : aucune
donnée n'est modifiée.

- Navigation repensée selon la largeur d'écran. Sur ordinateur, la barre latérale est
  rangée en sections « Groupe » et « Moi », avec en tête le groupe actif et le bouton
  **+ Ajouter** (enregistrer, envoyer un fichier, nouvelle session, publier), qui rend
  l'enregistrement accessible depuis l'ordinateur. Sur tablette, elle devient un rail
  d'icônes. Sur téléphone, une barre d'onglets (Accueil, Sessions, +, Morceaux, Plus)
  remplace le menu latéral, et la page **Plus** rassemble le reste : changement de groupe,
  fil, agenda, playlists, setlists, espace perso, profil, déconnexion
- Changer de groupe garde la section en cours (une liste se recharge pour le nouveau
  groupe, une page de détail ramène à sa liste) au lieu de revenir au tableau de bord.
  Un onglet resté ouvert se recharge quand le groupe actif a changé dans un autre
- Sur ordinateur, c'est la page qui défile : le retour arrière retrouve la position dans
  une liste, une nouvelle page s'ouvre en haut, et la barre du haut, la barre latérale et
  le mini-lecteur restent à l'écran. Une fenêtre ouverte fige la page derrière elle
- Fils d'Ariane : un seul chemin par page, réduit à la page parente (« ‹ Sessions ») sur
  téléphone. L'envoi d'un fichier et l'enregistrement nomment la page d'où l'on vient et
  y ramènent. Une publication renvoie au fil d'actualité
- Boutons de création harmonisés (icône +, même taille, même couleur) et en-têtes de page
  identiques d'un écran à l'autre. Le tableau de bord perd ses boutons en double avec
  « + Ajouter », et « Ajouter une date » ouvre l'agenda sur le jour même
- Accessibilité de la navigation : lien de la page en cours annoncé aux lecteurs d'écran,
  cibles tactiles d'au moins 44 px dans les barres du haut et du bas
- Enregistrement en direct : l'audio se recadre avant l'envoi (poignées de début et de
  fin, préécoute de la sélection). La copie de secours enregistre ses blocs dans l'ordre,
  pour qu'un enregistrement annulé ne réapparaisse pas
- Partager une prise : un seul bouton « Partager », qui copie le lien pour le groupe à la
  position du lecteur ou ouvre la gestion des liens d'écoute publics. Révoquer un lien
  demande confirmation
- Sessions : « À venir » et « Passées » (par année), recherche dans les morceaux joués,
  le lieu, les présents et la date. Un fichier déposé ou un enregistrement propose la
  session tenue le jour où il a été enregistré
- Playlists : suppression par leur auteur ou un admin du groupe ; retirer une piste qui
  porte une note de playlist demande confirmation
- La feuille de répétition d'un morceau reste au groupe quand le compte de son auteur
  est supprimé. **Migration `043_score_documents_keep_on_account_delete.sql`**
- Supprimer une session ne supprime plus les fichiers en attente de découpe qui lui
  étaient proposés : la découpe en fait choisir une autre.
  **Migration `044_audio_imports_keep_on_session_delete.sql`**

- Correction : un morceau créé dans un groupe n'empêche plus de créer ou de renommer
  un morceau du même titre dans un autre groupe. Les doublons restent refusés au sein
  d'un même groupe. **Migration `040_song_titles_per_group.sql`**
- Feuilles de répétition : sauvegarde des blocs et de leurs contenus, conservation des
  fichiers MusicXML/MXL originaux. **Migration `041_score_documents.sql`**
- Liens d'écoute publics : chaque lien actif se recopie (« Copier »), au lieu d'en créer
  un nouveau à chaque partage. Le jeton est gardé chiffré par une clé dérivée
  d'`AUTH_SECRET`, jamais en clair. Les liens créés avant la migration fonctionnent
  toujours, mais ne se recopient pas. **Migration `042_share_link_token_sealed.sql`**
- Correction : « Annuler » dans une confirmation n'empêchait pas l'action quand il s'agissait de
  retirer un membre ou le logo du groupe, supprimer un compte ou un morceau. Toutes les
  confirmations passent désormais par la fenêtre de l'application et disent ce qui sera
  perdu
- Interface harmonisée : police système, anneau de focus clavier commun, trois largeurs
  de page (marges mobiles comprises partout), et pages de groupe, de profil et
  d'administration remises sur les boutons, champs et couleurs du reste de l'application
- Menus (partage, ⋮ d'une prise, notifications) : même comportement partout, Échap rend
  le focus au bouton. Couleurs des types de session unifiées entre badges, agenda,
  tableau de bord et feuillet ; les indisponibilités prennent le rouge de la palette
- Tailles de texte ramenées à sept paliers (11 à 24 px) : tous les titres de page à la
  même taille, tableau de bord compris, et plus de tailles intermédiaires d'un écran à
  l'autre
- Dernières couleurs hors palette remplacées : repères horodatés des commentaires dans
  l'orange de l'application, piste en cours d'une playlist en édition comme en lecture,
  jour sélectionné de l'agenda sur fond neutre
- En-têtes du référentiel et des playlists sur un bandeau encre, visuel orange ; les
  sessions « Autre » passent du beige à un gris clair
- Lisibilité : le gris des indications et des dates, l'orange des liens d'action et le
  rouge des erreurs et du statut « Abandonné » atteignent le contraste minimal de 4,5:1
- Palette : le violet du type « Studio » et du statut « Proposition de travail » devient
  un prune, les pastilles de tonalité et de commentaires passent du rose au gris, et les
  fonds d'alerte rejoignent les tons chauds de l'application

## [1.2.1] — 2026-09-29

Aucune migration à appliquer.

- En-tête de session : un lieu du groupe n'affiche que son étiquette, l'adresse complète
  passe au survol (le lien vers la carte reste)
- Liste des sessions : chaque carte reprend le bandeau de l'en-tête d'une session,
  avec le feuillet daté, la couleur du type ou la photo et son voile, le lieu, les
  participants et le résumé des morceaux, prises et durée
- Correction : le numéro de version du header suit les modifications de `package.json`
  en développement, sans nécessiter de redémarrage manuel du serveur
- Mobile : le numéro de version apparaît aussi en bas du menu, sous les liens légaux

## [1.2.0] — 2026-09-27

Migration à appliquer : `039_group_places.sql`. Additive (une table, deux colonnes sur
`sessions` et `calendar_events`) : l'ancienne version tourne encore sur le schéma migré,
donc migrer d'abord, reconstruire l'app ensuite.

- Lieux du groupe : une étiquette (« Chez Élise ») et son adresse, gérés dans `/group` par
  l'admin du groupe. Le lieu d'une session ou d'un événement se choisit parmi eux, ou comme
  une adresse réelle proposée par la Base Adresse Nationale. L'adresse s'affiche sous le
  lieu d'une session et dans l'agenda, avec un lien vers la carte. Les lieux déjà employés
  deux fois deviennent des lieux du groupe. **Migration `039_group_places.sql`**
- En-tête de session : la date n'est plus réécrite sous le titre, le feuillet daté la
  porte seul (avec l'année hors de l'année en cours) ; une icône précède le lieu
- Correction : sur petit écran, l'en-tête des pages session, morceau, playlist et
  référentiel écrasait le texte à côté des commandes (titre coupé au milieu des mots).
  Détails sur toute la largeur, commandes sur leur propre rangée

## [1.1.0] — 2026-09-27

Migrations à appliquer, dans l'ordre : `036_song_covers.sql`, `037_session_photos.sql`,
`038_session_photo_veil.sql`. Toutes additives : l'ancienne version tourne encore sur le
schéma migré, donc migrer d'abord, reconstruire l'app ensuite.

- Prises en tracklist dans les vues session et morceau : numéro qui devient ▶ au survol
  (souris seulement), égaliseur et titre orange sur la prise en cours, durée à droite
- Morceaux en en-tête façon album : pochette générée, durée cumulée, « tout écouter »
  qui enchaîne les prises dans le mini-lecteur (⏭ pour passer à la suivante)
- En-tête commun aux pages session, morceau et playlist : visuel carré (feuillet daté
  pour une session, pochette pour un morceau, icône pour une playlist), chiffres et ▶
- Playlist en tracklist, lue par le mini-lecteur (paroles du morceau en cours affichées) ;
  réordonner, retirer et ajouter passent en mode édition. La forme d'onde de la page
  disparaît, et avec elle le calcul des pics au chargement
- Référentiel de morceaux en liste à pochettes ; le tableau (édition, suppression) devient
  le mode édition
- Lecteurs restylés : forme d'onde lue en orange, ▶ rond orange au centre, commandes
  communes aux lecteurs audio et vidéo ; mini-lecteur avec la pochette du morceau
- Pochette d'un morceau : tout membre peut en déposer une depuis la page du morceau
  (recadrée en carré). **Migration `036_song_covers.sql`**
- Recherche d'une reprise dans le catalogue Deezer : remplit artiste, année et durée,
  importe la pochette de l'album
- Photo de bandeau d'une session : tout membre peut en poser une (recadrée au centre au
  format du bandeau, métadonnées EXIF retirées), sous un voile sombre dont l'intensité se
  règle en mode édition, avec aperçu du bandeau en direct. Une photo posée ne se change
  qu'en édition. **Migrations `037_session_photos.sql` et `038_session_photo_veil.sql`**
- Vue session : les paroles et notes musicales ne s'affichent plus sous les morceaux
- Version affichée sous le nom du site, en haut à gauche
- Correction : sur téléphone, le bas du menu latéral (compte, liens légaux) passait sous
  la barre d'actions

## [1.0.0] — 2026-09-25

Première version numérotée : tout ce qui existait jusque-là. Schéma à jour jusqu'à la
migration `035_personal_imports.sql` incluse.

- Comptes individuels, groupes multiples avec groupe actif, rôles globaux et rôles de groupe
- Sessions, référentiel de morceaux, prises (fichier audio et/ou vidéo YouTube) numérotées
  automatiquement, lecteur waveform
- Enregistrement en direct depuis le navigateur, découpe automatique sur les blancs
  (vers le groupe ou l'espace perso)
- Commentaires ancrés, mentions, réactions, édition ; notifications d'activité
- Playlists, setlists, agenda partagé
- Espace perso, publications dans le groupe, fil d'actualité
- Liens d'écoute publics à jeton
- Logo et réseaux du groupe, suppression de groupe avec sauvegarde préalable
