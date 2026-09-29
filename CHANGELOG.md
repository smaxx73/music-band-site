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

Migrations à appliquer, dans l'ordre : `040_song_titles_per_group.sql`, puis
`041_score_documents.sql`. La première remplace l'unicité globale des titres par une
unicité dans chaque groupe, sans modifier les morceaux existants. La seconde ajoute les
tables des feuilles de répétition et de leurs fichiers MusicXML/MXL originaux.

- Correction : un morceau créé dans un groupe n'empêche plus de créer ou de renommer
  un morceau du même titre dans un autre groupe. Les doublons restent refusés au sein
  d'un même groupe. **Migration `040_song_titles_per_group.sql`**
- Feuilles de répétition : sauvegarde des blocs et de leurs contenus, conservation des
  fichiers MusicXML/MXL originaux. **Migration `041_score_documents.sql`**

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
