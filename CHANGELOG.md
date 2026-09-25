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
