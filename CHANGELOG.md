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
