# Comportements attendus par feature

## Vocabulaire

Trois objets portent du son, ou s'y rapportent, et se confondent vite. Un écran n'emploie
un mot que dans le sens de cette table ; le code, lui, a gardé ses noms anglais, qui ne
recoupent **pas** les mots de l'écran.

| À l'écran | Ce que c'est | En base / URL |
|---|---|---|
| **Morceau** | l'œuvre, au référentiel du groupe ; pas un son | `songs`, `/songs/[id]` |
| **Prise** | un son d'une session, joué sur un morceau, numéroté (« Sunny — Prise 3 ») | `recordings`, `/recording/[id]` |
| **Enregistrement** (perso) | un son à soi, titré, sans session ni morceau | `personal_recordings`, `/perso/[id]` |
| **Espace perso** | l'ensemble de ses enregistrements — jamais « Mon espace » seul, ni « privé » | `/perso` |
| **Publication** | un renvoi vers un enregistrement (ou une vidéo, une suggestion) dans un groupe | `posts`, `/posts/[id]` |
| **Segment** / **passage** | portion détectée par la découpe ; devient une prise ou un enregistrement | `audio_imports` (le fichier) |

- `recordings` veut dire **prise**, jamais « enregistrement » : un `RecordingRow` est une
  ligne de prise, un `personal_recording` un enregistrement
- Un enregistrement **publié** reste un enregistrement, pas une prise ; **classé**, il en
  devient une et cesse d'être un enregistrement
- **Enregistrer** désigne la captation au micro (`/record`, onglet « Enregistrer »). Là où
  un enregistrement ou une prise est à l'écran — page d'une prise, d'un enregistrement,
  d'une publication, édition d'un commentaire —, sauvegarder se dit **Valider**
  (« Sauvegarde… » pendant l'envoi), pour qu'un bouton ne se lise pas « capter »
- Le choix de découpe se dit **« D'un seul tenant / À découper sur les blancs »**, sans
  « morceaux » ni « prises » : vers l'espace perso, un passage ne devient ni l'un ni l'autre
- **Reprise** désigne un morceau d'un autre artiste (`songs.original_artist`) ; une découpe
  se **reprend**

## Upload d'une prise

1. Sélection de la **session** (existante ou création à la volée) et du **morceau**
   (liste depuis `songs` où `status != 'abandonne'`). Choisir un fichier propose la session
   tenue le jour de sa date (`lastModified`, celle de l'enregistrement sur un téléphone),
   sans jamais défaire une session choisie à la main ou passée par `?session_id=`.
   Son **nom** propose de même le morceau qui s'y lit à peu près (`songFromFileName`,
   `src/lib/song-match.ts`) : « 2025-03-12 Sunny v2.m4a », « WeWillRockYou-live.mp3 ».
   Mots entiers seulement (« sunnyday » ne désigne pas « Sunny »), sans casse ni accents,
   article de tête facultatif (« wall » → « The Wall »), une faute tolérée dès 5 lettres
   et deux dès 9. Le titre le plus long l'emporte (« Sunny Afternoon » plutôt que
   « Sunny ») ; deux morceaux aussi plausibles, ou un titre de moins de 3 lettres, et rien
   n'est proposé. Les morceaux « À nommer » ne se devinent pas. Une ligne sous le
   sélecteur dit que le choix vient du nom du fichier
2. Réception multipart : fichier audio + `session_id`, `song_id`
3. Validation : MIME audio autorisé via `audio_formats`, taille < 200 Mo, session et morceau dans le groupe actif
   (réception multipart commune à l'upload et aux imports : `src/lib/server/upload-stream.ts`)
4. Streaming du fichier brut vers un fichier temporaire et calcul SHA-256 sans charger l'audio en mémoire
5. Détection de doublon dans le groupe actif via `recordings.file_hash` ; retour `409` avec les informations de la prise existante si doublon
6. Conversion ffmpeg → mp3 192 kbps + suppression silence début/fin, et recopie d'un canal
   muet sur l'autre — voir « Son d'un seul côté »
7. Extraction durée via ffprobe
8. Calcul du `take` dans une transaction :
   `SELECT COALESCE(MAX(take), 0) + 1 FROM recordings WHERE song_id=$1`
9. Insertion en base avec `file_hash` et `source_file_name` (le nom du fichier tel que
   déposé, conservé pour l'affichage seul — le fichier sur disque, lui, est toujours
   nommé depuis l'id de la prise), sauvegarde `/data/audio/{id}.mp3`, retour du
   `recording` créé
10. L'écran enchaîne directement sur `/recording/{id}` — lecteur et commentaires — plutôt
    que de rester sur le formulaire : c'est juste après l'ajout qu'on commente la prise.
    Idem pour une prise vidéo YouTube. Une découpe, elle, mène à `/decoupe/[id]`

### Envoi par lots

Une répétition enregistrée morceau par morceau au téléphone donne dix fichiers : les
verser un par un, formulaire compris, décourage de les verser tous.

- Le champ fichier de `/upload` en accepte **plusieurs d'un coup**. Chacun devient une
  prise de la même session ; le formulaire liste alors les fichiers
  (`UploadBatch.svelte`), chacun avec **son morceau**, deviné d'après son nom comme pour
  un fichier seul, et « + Nouveau morceau… » sur place
- **Rangés par date d'enregistrement** (`lastModified`), et envoyés dans cet ordre : deux
  fichiers du même morceau se numérotent dans l'ordre où ils ont été joués. La session
  proposée est celle du jour du premier fichier
- Un fichier sans morceau bloque l'envoi ; « Nommer plus tard » donne à chacun le sien
  (« À nommer — … » à l'heure du fichier), comme dans la découpe. Un par fichier, pas un
  pour tous
- **Un fichier après l'autre**, chacun par `POST /api/upload` comme un envoi seul :
  conversion, doublon, notification. **Rien de neuf côté serveur.** La conversion est la
  partie coûteuse : le serveur ne gagnerait rien à en mener plusieurs de front
- Un échec n'arrête pas la série : le fichier le dit, et « Réessayer » ne renvoie que ceux
  qui ont échoué, dans la même session — une session créée à la volée n'est créée qu'une
  fois. Un doublon est signalé avec la prise existante, et n'est pas renvoyé. Tant que des
  prises de la série sont créées, la session ne se change plus
- Tout est passé : l'écran mène à la **session**, où les prises se lisent rangées par
  morceau. Sinon il reste, avec le bilan (« 4 prises ajoutées · 1 déjà présente ») et le
  lien vers la session
- Fermer l'onglet pendant l'envoi demande confirmation ; naviguer dans l'application, non :
  les fichiers restants partent quand même
- Ramené à un seul fichier avant l'envoi, on retrouve le formulaire simple. Pas de lot en
  mode « À découper sur les blancs » (un fichier, un écran de découpe) ni en vidéo YouTube
- Le même envoi sert aux **prises en série** de `/record` (`sendBatchItems`,
  `nameBatchItemsLater`, `src/lib/upload-client.ts`) — voir « Prises en série »

## Son d'un seul côté (canal muet)

Un micro branché sur l'entrée 1 d'une carte son, l'entrée 2 restée vide : le fichier est
stéréo, mais le canal droit est plat. On l'entend alors dans une seule oreille.

- **Détecté et corrigé à la conversion**, sans rien demander : upload d'une prise, dépôt
  dans l'espace perso, enregistrement en direct, extraits d'une découpe
  (`detectSingleChannel`, `src/lib/server/ffmpeg.ts`). Le canal qui porte le son est
  recopié sur l'autre : le son revient au centre
- Critère : un canal sous **−60 dB RMS** et au moins **30 dB** sous l'autre, mesurés sur
  le fichier entier. Une entrée vide reste vers −90 dB, un micro branché dépasse largement
  −60 : un enregistrement simplement calme, ou un vrai stéréo très latéralisé, n'est pas
  visé. Dans le doute — mono, plus de deux canaux, fichier illisible —, rien n'est touché
- Une découpe mesure l'**original entier** une fois, puis applique la même correction à
  chaque extrait : un canal débranché l'est pour toute la captation
- **Fichiers déjà stockés** : `scripts/fix-single-channel.mjs` parcourt `AUDIO_DIR` et
  `AUDIO_DIR/perso`, liste les fichiers concernés, et ne les corrige qu'avec `--apply`
  (`--backup=<dossier>` garde les originaux). Le mp3 est réencodé à 128 kbps, le débit de ces anciens fichiers — une
  génération de compression de plus — et la forme d'onde en cache est effacée pour se
  refaire. `file_hash` est l'empreinte du fichier déposé, pas du mp3 : la détection de
  doublon n'en est pas affectée
- Pas de bouton à l'écran ni de colonne en base : un fichier corrigé ne se distingue plus
  d'un autre, et il n'y a rien à décider au cas par cas

## Amélioration du son d'une prise

Un téléphone ou un micro posé dans la salle donne une prise trop faible, ou saturée et
plus forte que les autres, étouffée par le grave de la pièce, avec du grondement et des
écarts de volume qu'on rattrape au bouton en écoutant. L'amélioration remet le son à un niveau d'écoute commun, sans le dénaturer.

- **Proposée, jamais imposée.** Sur `/recording/[id]`, là où l'on arrive juste après un
  envoi ou un enregistrement, la mesure se charge après la page (quelques secondes la
  première fois, gardée ensuite dans `recordings.audio_analysis`). Si elle relève un
  défaut que la chaîne corrige, un bandeau sous le lecteur le dit (« Son faible : il faut
  monter le volume pour l'entendre ») avec « Améliorer le son ». Sinon, un simple lien
  discret, pour qui veut quand même essayer. Une prise déjà améliorée ne se mesure pas à
  l'ouverture : « Son amélioré » vient du chargement de la page, et la mesure attend
  qu'on ouvre « Comparer ». Une même mesure demandée deux fois à la fois (deux membres,
  deux onglets) ne décode le fichier qu'une fois. **Mesure d'avance** : une minute après
  son démarrage, le serveur mesure une à une, en priorité basse (`nice` 19) et les plus
  récentes d'abord, les prises non
  améliorées qui n'ont pas de mesure à jour — le calcul est le même, il change de moment,
  et personne ne l'attend à l'ouverture. Une fois à jour, il ne coûte qu'une requête
- **La mesure** (EBU R128, `ebur128`) : loudness intégrée, écarts de volume (LRA), crête
  vraie, et l'**équilibre spectral** — énergie du grave (40–150 Hz), de la présence
  (2–6 kHz) et des aigus (au-dessus de 6 kHz), chacune moins celle du bas-médium
  (150–500 Hz). Défauts : son faible (sous −20 LUFS), très fort (au-dessus de −10),
  grands écarts (LRA > 14 LU), **son étouffé** (présence sous −11 dB **et** aigus sous
  −21 dB : le grave de la salle domine — c'est la pièce qui l'imprime, téléphone comme
  micro à condensateur), **grave trop présent** (au-dessus de −4,5 dB). La présence seule
  ne suffit pas à dire « étouffé » : un mix de groupe aux cymbales brillantes a souvent la
  présence creuse sans l'être. Ces défauts de timbre sont proposés même à bon volume.
  Une crête au plafond est signalée sans en affirmer la cause (« saturation à
  l'enregistrement, ou son déjà masterisé ») : l'amélioration ne la répare pas, et elle
  ne suffit pas à la proposer. Sous −50 LUFS, rien à améliorer : le gain ferait un souffle
- **La chaîne**, dans l'ordre : gain d'entrée (amène le son à −20 LUFS, niveau de travail
  du compresseur), coupe-bas 35 Hz (le grondement, sans mordre sur le mi grave d'une basse),
  égalisation dosée par l'équilibre aigus / grave, compression douce (1,5:1 à 2,5:1 selon
  les écarts de volume mesurés), grave allégé s'il le faut, normalisation à **−14 LUFS** (le niveau de YouTube et
  Spotify ; −16 paraissait trop faible, −12 écrasait les attaques du piano), limiteur à −1,5 dBFS
  (`src/lib/audio-enhance.ts`)
- **L'égalisation** à plein dosage : −4 dB à 280 Hz (le carton), +3 dB à 3 kHz, +3 dB
  au-dessus de 7 kHz. Rien au-dessus de −10 dB d'équilibre ; dosage croissant jusqu'au
  plein à −13 dB, jamais au-delà. **Calibrée à l'oreille** sur deux prises de répétition
  piano acoustique et voix, dans un même local, l'une au téléphone, l'autre au micro à
  condensateur (−14,4 et −13,5 dB), écoutées au même volume : ce dosage sonnait juste sur
  les deux, le double devenait criard. Un morceau de groupe déjà masterisé (présence
  −12,4 dB, mais aigus −16,7 dB) sonnait mieux **sans** égalisation, avec la compression :
  c'est lui qui fixe la condition sur les aigus. Une seule salle et deux formations pour
  l'instant : les seuils sont à revoir sur d'autres prises
- **Le grave**, réglé à part de l'égalisation — c'est dans le bas que la différence
  s'entend : séparer le carton creusé de l'éclaircissement ne changeait presque rien à
  l'écoute, le renfort du grave si (« on entend mieux les basses du piano ») :
  - **Allégé** : −2,5 dB sous 100 Hz (plateau), **après** le compresseur — placée avant,
    la coupe le faisait moins travailler, et il rendait au grave une partie de ce qu'on lui
    retirait. Proposé au-dessus de −4,5 dB de grave. Calibré sur le morceau de groupe
    (grave −2,2 dB, contre −9,2 et −7,2 pour les prises piano–voix ; seuil au milieu) :
    entre −1,5 et −2,5 dB écoutés au même volume, −2,5 sonnait le mieux ; une coupe plus
    franche avant le compresseur l'avait trop atténué
  - **Renforcé** : +2 dB à 90 Hz, avant le compresseur — le corps de la main gauche du
    piano, de la basse. Il faisait partie de l'égalisation franche au calibrage : il est
    proposé avec elle (prise étouffée), sauf grave déjà trop présent. Faute de prise au
    grave maigre mais non étouffée, pas de seuil propre
  - **Tel quel** sinon
- Un son **trop brillant** n'est pas corrigé — aucune prise pour le calibrer
- **Deux passes** : la première mesure la loudness en sortie de compresseur, la seconde
  applique le gain fixe qui l'amène à la cible. Pas de `loudnorm` dynamique, qui pomperait
  sur un live
- **Rien ne décale le temps** — filtres IIR, compresseur sans anticipation, limiteur au
  retard compensé (`latency`), vérifié sur des impulsions : un commentaire ancré à 1:23
  reste sur la même note, et la durée ne change pas
- **Réglages par prise** : le module propose les siens, l'oreille a le dernier mot. Dans la
  fenêtre, **Égalisation** (Aucune / Douce / Franche — douce = moitié de franche),
  **Grave** (Allégé / Tel quel / Renforcé) et **Compression** (Oui / Non), le choix du module marqué
  « proposé ». Les seuils ne
  décident que de la proposition : une prise qui les déjoue se corrige là, sans toucher
  aux autres — pas de seuils réglables à l'échelle du groupe. Un aperçu est lié à ses
  réglages (dans son nom de fichier) : des réglages encore jamais essayés demandent d'en
  préparer un avant de comparer ou de garder. Les réglages gardés restent sur la prise (`recordings.enhancement`) ; pour en
  essayer d'autres, on revient d'abord à l'original
- **D'une prise à l'autre de la session** : même salle, même micro, souvent mêmes
  réglages. Sur une prise pas encore améliorée, la fenêtre reprend ceux de la **dernière
  prise améliorée de la session** plutôt que la proposition du module, le dit (« Repris de
  « Sunny », prise 3 »), et offre de revenir à la proposition. Une prise améliorée propose
  en plus **« Appliquer à ces N prises »** : ses réglages, sur les autres prises de la
  session pas encore améliorées — jamais celles qu'on a déjà réglées. Une requête par
  prise, l'une après l'autre, la progression à l'écran (fenêtre gardée ouverte), les
  échecs nommés. Seuls l'égalisation, le grave et la compression se reprennent : gain et taux de
  compression suivent la mesure de chaque prise. Chacune se rétablit ensuite à part
- **Écouter avant de décider** : « Préparer la version améliorée » rend un aperçu (quelques
  secondes pour un morceau) **hors d'`AUDIO_DIR`**, dans le répertoire temporaire —
  personne ne l'a encore gardé. Puis une écoute comparée **Original / Amélioré** sur un
  seul `<audio>` : basculer reprend au même endroit. L'écran rappelle que la version la
  plus forte paraît souvent la meilleure
- **Un aperçu par réglage essayé**, pour ne jamais rendre deux fois la même chose : revenir
  à des réglages déjà écoutés les fait réentendre aussitôt, au même endroit du morceau, et
  « Garder » reprend l'aperçu écouté sans nouveau rendu. Ils restent après la fermeture de
  la fenêtre (« Annuler » ne garde rien pour le groupe, il n'efface pas ce qui a été rendu).
  Chacun pèse le poids de la prise : **6 au plus par prise**, le plus ancien part le
  premier, et tout aperçu est balayé au bout d'un jour. Deux demandes du même
  aperçu à la fois (double clic, deux membres) n'en rendent qu'un
- **« Garder la version améliorée »** : elle prend la place de `{id}.mp3` — c'est elle que
  jouent la barre du bas, les playlists, les liens d'écoute — et l'original passe à côté,
  `{id}.original.mp3`. Renommages atomiques dans la transaction ; la forme d'onde en cache
  est refaite. Sous le lecteur : « Son amélioré · Comparer avec l'original »
- **Réversible** : « Revenir à l'original » le remet en place, et la version améliorée
  redevient un aperçu : on revient souvent à l'original pour comparer encore ou essayer
  autre chose, et la regarder de nouveau ne coûte rien. Seulement si elle a été gardée
  depuis le dernier démarrage du serveur : plus ancienne, elle a pu sortir d'une chaîne
  qui a changé depuis, et elle est effacée. Pas de confirmation : rien ne se perd
- **Tout membre** du groupe, comme la note d'une prise : un geste de travail sur le son
  commun, et il se défait. L'écran dit qui l'a fait et quand. Pas de notification
- La source est le **mp3 stocké** : le fichier déposé n'est pas conservé. Une génération
  de compression de plus à 192 kbps, inaudible face à ce que la chaîne corrige
- L'original compte dans le **volume du groupe** ; il part avec la prise, la session ou le
  groupe (`removeRecordingFiles`). `file_hash` reste l'empreinte du fichier déposé : la
  détection de doublon n'est pas affectée
- Pas sur une prise vidéo seule, ni sur un enregistrement perso (pour l'instant)

## Morceau absent du référentiel, et morceaux « À nommer »

Ce qu'on vient d'enregistrer ne correspond pas toujours à un morceau déjà créé — une
reprise essayée pour voir, une idée sans titre. Partir dans `/songs` au milieu d'un envoi
fait perdre le fil, surtout au téléphone en répétition.

- Tout sélecteur de morceau où l'on classe une prise (`/upload`, `/record`, chaque segment
  de la découpe, « Changer de morceau » sur la prise) propose **« + Nouveau morceau… »**
  (`src/lib/components/SongSelect.svelte`). Un champ titre s'ouvre sur place ; le morceau
  est créé au statut `en_apprentissage` par `POST /api/songs` et aussitôt sélectionné.
  Les autres champs (compositeur, tonalité, durée…) se complètent plus tard dans `/songs`
- Le titre arrive **prérempli et sélectionné** : « À nommer — 22 sept. 14:05 ». Pressé,
  on valide tel quel ; sinon on tape par-dessus. L'heure est celle de l'enregistrement
  (début de la captation sur `/record`, date du fichier sur `/upload`, dépôt de
  l'import en découpe) : c'est ce qui aide à le reconnaître ensuite. Suffixé « #2 »,
  « #3 »… si le titre est pris — les titres sont uniques dans un groupe
- Un titre **déjà au référentiel** (casse ignorée) n'est pas une erreur : le morceau
  existant est sélectionné. S'il est `abandonne`, l'écran le dit plutôt que de le réactiver
- Le préfixe « À nommer — » est le **seul marqueur** (`src/lib/songs.ts`) : pas de colonne
  en base. Renommer le morceau suffit à le faire sortir de cet état
- **Découpe** : « Nommer plus tard » donne à chaque segment retenu sans morceau le sien
  (« #1, #2… »), pour valider une répétition entière d'un geste. Un morceau par segment,
  pas un pour tous : regrouper à tort serait plus pénible à défaire que renommer

### Corriger depuis la prise

- Sur `/recording/[id]`, un morceau « À nommer » s'annonce sous l'en-tête avec un champ
  **Renommer** (`PATCH /api/songs/[id]`). Si le titre saisi est celui d'un autre morceau,
  l'écran propose d'y rattacher la prise plutôt que d'échouer
- Toute prise porte **« Changer de morceau »** : même sélecteur, création comprise.
  `PATCH /api/recordings/[id]` avec `{ song_id }`. La prise prend le numéro suivant du
  morceau visé, calculé dans la transaction comme à l'upload ; l'ancien morceau garde un
  trou, comme à la suppression d'une prise — on ne renumérote pas
- Un morceau « À nommer » vidé de sa dernière prise **disparaît** avec le déplacement :
  il n'existait que pour la porter. Pas s'il est programmé dans une setlist, ni un morceau
  nommé — quelqu'un l'a choisi —, ni s'il porte ce qu'on y a mis : paroles, notes
  musicales, pochette, feuille de répétition, ou la suggestion dont il est issu
- `/songs` marque ces morceaux d'une étiquette « à nommer » et propose un filtre dédié,
  pour qu'ils ne s'accumulent pas sans qu'on le voie

## Enregistrement en direct (`/record`)

Pour capter une répétition sans passer par un enregistreur à part : le téléphone posé
au milieu de la salle, ou l'interface audio branchée au PC.

- **Enregistrer d'abord, classer ensuite.** En répétition, on lance le micro sans remplir
  de formulaire : `/record` ne montre que l'enregistreur. La **destination** — le groupe ou
  l'espace perso —, la session et le morceau ne se demandent qu'une fois l'enregistrement
  terminé, préremplis au plus probable :
  - la **session du jour de l'enregistrement** si elle existe (son début, à l'heure de
    l'appareil — pas le jour où on le classe : une copie de secours reprise le lendemain
    va encore à la session de la veille), sinon une nouvelle session datée de ce jour,
    créée à l'envoi
  - **« À découper sur les blancs »** dès 10 min d'enregistrement, « D'un seul tenant »
    en deçà, avec le choix du morceau — ou sa création sur place, voir « Morceau absent
    du référentiel »
- **Destination : le groupe, ou son espace perso.** Le groupe par défaut — c'est la
  répétition qu'on capte le plus souvent. « Dans mon espace perso » ne demande ni session ni
  morceau, juste un titre prérempli à la date du jour : une idée jouée seule n'a pas à
  entrer dans le groupe tant qu'on ne l'a pas décidé, et elle se classera en prise plus
  tard (voir « Classer un enregistrement perso dans une session »). Elle passe par
  `POST /api/personal`, comme un dépôt fait depuis `/perso` — **rien de neuf côté serveur**.
  « À découper sur les blancs » y vaut aussi : l'enregistrement part en découpe vers l'espace
  perso (voir « Découpe vers l'espace perso ») : le titre saisi devient le titre commun
  des passages, et la note, sans équivalent, disparaît du formulaire
  Sans groupe actif, l'espace perso est la seule destination proposée
- Tout se passe dans le navigateur (`getUserMedia` + `MediaRecorder`, sans dépendance) :
  `src/lib/components/AudioRecorder.svelte`. Le résultat est un `File` ordinaire, envoyé
  exactement comme un fichier choisi (`src/lib/upload-client.ts`, partagé avec `/upload`) —
  `POST /api/upload` pour une prise, `POST /api/imports` pour découper une répétition
  entière. **Rien de neuf côté serveur**
- `/upload` renvoie vers `/record` (« Pas encore de fichier ? Enregistrer maintenant ») ;
  il ne porte pas l'enregistreur lui-même, qui imposerait de remplir le formulaire d'abord
- Toute entrée que le système expose : micro intégré, casque, interface USB. Le sélecteur
  d'entrée n'apparaît qu'une fois l'accès accordé — le navigateur ne nomme pas les entrées
  avant. Stéréo au mieux : pas de multipiste
- **Annulation d'écho, réduction de bruit et gain automatique sont coupés** : pensés pour
  la visio, ils écrasent la dynamique et mangent les notes tenues
- Format : WebM/Opus (Chrome, Firefox, Android) ou MP4/AAC (Safari, iOS), à 192 kbit/s,
  le débit de stockage : capter moins bien qu'on ne stocke ferait perdre ce que le mp3 garde.
  Le type est envoyé **sans** ses paramètres (`audio/webm`, pas `audio/webm;codecs=opus`) :
  le serveur le compare tel quel à `audio_formats`
- Un WebM de `MediaRecorder` n'annonce pas sa durée : celle d'un import se lit donc sur le
  proxy, qui partage l'échelle de temps de l'original
- Vumètre de crête (−60 à 0 dBFS) dès l'ouverture du micro, avant même d'enregistrer, pour
  placer le téléphone ; « Saturation » s'affiche 1,5 s après chaque crête écrêtée
- Pause / reprise ; arrêt automatique avant 200 Mo (≈ 2 h 20 à 192 kbit/s), prévenu à 170 Mo
- **Annuler** pendant l'enregistrement ou en pause : ce qui est capté est jeté, la copie de
  secours effacée, et le micro reste ouvert pour repartir — annuler n'est pas quitter
  l'écran. Au-delà de 5 s, une confirmation `warning` nomme la durée perdue ;
  l'enregistrement continue pendant la question, pour que « non » ne coûte rien. Même
  confirmation sur « Recommencer », qui jette un enregistrement déjà terminé
- **Écran gardé allumé** (Wake Lock) pendant l'enregistrement, repris au retour sur
  l'onglet : un téléphone qui se verrouille coupe le micro. L'écran dit quand le navigateur
  ne le permet pas
- **Copie de secours** dans IndexedDB, un bloc toutes les 5 s (`src/lib/recording-store.ts`) :
  un onglet qui plante ou un envoi qui échoue ne perd pas l'heure enregistrée.
  L'enregistreur propose alors de récupérer l'enregistrement non envoyé, et le tableau de
  bord le signale (« À toi »). Chaque copie n'est effacée qu'une fois **son** fichier
  accepté par le serveur, ou jeté : les autres prises d'une série attendent encore le leur.
  Indisponible en navigation privée, et l'écran le dit
- Quitter la page pendant l'enregistrement demande confirmation ; le formulaire de
  classement n'apparaît qu'une fois l'enregistrement terminé
- « Enregistrer » est la première entrée du menu **+ Ajouter** (voir « Navigation ») :
  c'est au téléphone, en répétition, qu'on lance un enregistrement — et sur ordinateur,
  interface audio branchée

### Prises en série

En répétition, on enregistre souvent plusieurs prises d'affilée en s'arrêtant entre deux :
on discute, on s'accorde, on refait le pont. Sortir de `/record` après chaque prise,
rouvrir le micro, rechoisir l'entrée et attendre la conversion cassait le rythme.

- Une prise terminée propose **« Prise suivante »**, avant le recadrage : elle rejoint la
  série et l'enregistrement de la suivante **démarre aussitôt**. Un seul toucher entre deux
  morceaux. Dans le groupe seulement (`onkeep` d'`AudioRecorder.svelte`, passé seulement
  avec un groupe actif) : une idée jouée seul va dans l'espace perso une à
  une, ou se découpe
- **Le micro reste ouvert** entre les prises, avec l'entrée choisie — sans série, il se
  ferme à la fin d'un enregistrement, comme avant. S'il tombe entre-temps (écran verrouillé,
  interface débranchée), « Prise suivante » le rouvre
- La série s'affiche sous l'enregistreur, **y compris pendant l'enregistrement de la
  suivante** : on nomme les prises entre deux morceaux. Même liste que l'envoi par lots
  (`UploadBatch.svelte`) : une ligne par prise (« Enregistrée à 14:05 », durée retenue,
  réécoute), son morceau, « + Nouveau morceau… », « Nommer plus tard »
- **La prise suivante propose le morceau de la précédente** (« Même morceau que la prise
  précédente ») : on rejoue souvent le même. La première garde celui choisi dans le
  formulaire simple, s'il l'était
- La dernière prise terminée fait partie de la série dès qu'elle s'affiche : on l'envoie
  avec les autres sans en enregistrer une de plus. Son recadrage suit la série ; celui
  des précédentes est figé quand on passe à la suivante
- **Rien ne part avant « Envoyer »**, désactivé tant qu'une prise s'enregistre : tout va
  dans la même session, une prise après l'autre par `POST /api/upload`, comme un envoi par
  lots — échecs à réessayer, doublons signalés, session verrouillée dès qu'une prise y est,
  puis direction la session. **Rien de neuf côté serveur.** Envoyer au fil de l'eau a été
  écarté : au téléphone, l'envoi disputerait réseau et batterie à la captation
- Retirer une prise de la série demande confirmation (`warning`) : elle n'existe encore
  que dans ce navigateur. Celle qu'affiche l'enregistreur passe par son « Recommencer »
- **Une série interrompue** (onglet fermé, plantage) se récupère d'un bloc : chaque prise
  reprend sa place, dans l'ordre où elle a été jouée, et la session du jour est proposée.
  Ailleurs (`/perso`, publication), l'enregistreur renvoie vers « Enregistrer » plutôt que
  de n'en récupérer qu'une
- Laisser tourner l'enregistreur une heure puis découper sur les blancs reste la réponse
  quand on ne veut pas toucher au téléphone ; la série, quand on veut garder seulement ce
  qu'on a décidé d'enregistrer

## Découpe automatique d'un enregistrement (`/decoupe/[id]`)

Premier des outils d'amélioration audio branchés à la suite de l'upload.

- Case **« À découper sur les blancs »** sur `/upload`. Le morceau ne se
  choisit alors pas dans le formulaire : il se choisit segment par segment, après analyse
- Le même libellé partout (`/upload`, `/record`, `/perso`), qui ne parle ni de morceaux ni
  de prises : vers l'espace perso, un passage ne devient ni l'un ni l'autre. L'écran de
  découpe y dit « passage » là où il dit « prise » pour le groupe
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
- Un import est **personnel** : seul son déposant le voit — dans le groupe où il l'a
  déposé, ou quel que soit le groupe actif s'il est destiné à l'espace perso (voir
  « Découpe vers l'espace perso »). Rien n'est encore publié, personne d'autre n'a à le voir
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
  fausse note, bruit de salle). Un segment retenu sans morceau bloque la validation —
  « Nommer plus tard » les pourvoit tous d'un morceau « À nommer »
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
  réglages de stockage de l'application (mp3 192 kbps) — un seul encodage sur tout le
  chemin d'une prise. Puis création dans **une seule transaction** : les segments d'un
  même morceau se numérotent à la suite, sans trou ni collision
- Les fichiers sont taillés **avant** l'écriture en base, et posés dans `AUDIO_DIR` ensuite :
  un fichier orphelin se rattrape, une ligne pointant vers un fichier absent non.
  Si quoi que ce soit échoue, les prises déjà insérées repartent et l'import redevient découpable
- L'import est **réclamé** (`consumed_at`) avant tout travail : un double envoi ne crée pas
  deux séries de prises. Un import déjà découpé répond `409`
- Une notification par prise créée, comme pour un upload simple

### Découpe vers l'espace perso

Une séance de travail seul, plusieurs idées jouées d'affilée : le même outil, mais chaque
passage devient un **enregistrement perso**, pas une prise.

- « À découper sur les blancs » sur `/perso` (fichier ou enregistrement) et sur `/record` quand la
  destination est l'espace perso. Même seuil qu'au groupe : proposé d'office dès 10 min
  d'enregistrement en direct
- `POST /api/imports` avec `destination=perso` : ni groupe actif, ni session. L'import a
  `group_id` NULL (migration 035) ; il reste **personnel** (`user_id`) et se voit quel que
  soit le groupe actif, comme l'espace lui-même. Doublon cherché dans l'espace du seul
  déposant, comme à un dépôt direct
- Même écran de découpe (`/decoupe/[id]`), mêmes réglages, même préécoute, même
  rendu depuis l'original. Seule la destination change : un **titre commun** — celui saisi
  avant l'envoi s'il y en a un (passé en `?titre=`), sinon la date pour un enregistrement
  fait dans le navigateur, le nom du fichier pour un fichier déposé —, que chaque passage
  reprend numéroté (« … — 1, — 2 ») sauf s'il reçoit le sien. Un passage n'est donc jamais
  « sans morceau », et « Nommer plus tard » n'a pas lieu d'être
- Les enregistrements créés portent le nom du fichier découpé, sans note ; rien n'est
  notifié ni publié — ils attendent dans l'espace, à publier ou à classer un par un
- `/perso` liste ses fichiers encore reprenables, avec « Reprendre » et « Refaire la
  découpe », sous les mêmes règles de rétention

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
- La découpe (« à découper sur les blancs ») ne s'applique pas à une vidéo
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

## Lieux et adresses

Le lieu d'une session ou d'un événement d'agenda est un **texte** (`location`) : c'est ce
qui s'affiche partout. À la saisie, il se choisit de deux façons, dans un seul champ
(`LocationInput.svelte`) :

- **Un lieu du groupe** : une étiquette (« Chez Élise », « Studio du Hangar ») et, si on la
  connaît, son adresse. La session porte l'étiquette ; l'adresse se relit dans
  `group_places` par l'étiquette (sans casse ni espaces de bord), donc la corriger une fois
  la corrige pour toutes les sessions
- **Une adresse réelle autre**, ponctuelle, proposée par la **Base Adresse Nationale**
  (service public de l'IGN, sans clé) dès 3 caractères. La session porte l'adresse en
  toutes lettres et ses coordonnées (`location_lat`, `location_lon`, migration 039) pour le
  lien vers la carte. Elle n'entre **pas** dans les lieux du groupe

La liste propose d'abord « Lieux du groupe » (les plus employés d'abord, recherche sans
casse ni accents, sur l'étiquette comme sur l'adresse), puis « Adresses ». Une ligne sous
le champ dit ce qui est retenu : lieu du groupe (avec son adresse), adresse reconnue, ou
— ni l'un ni l'autre — un texte gardé tel quel, sans adresse. Retaper le lieu défait
l'adresse choisie. Même champ partout : édition et création de session, agenda, création
rapide d'une session dans `/upload`, `/record` et au classement d'un enregistrement perso.

### Gestion des lieux (`/group`)

- Section **« Lieux »** de `/group` (`GroupPlaces.svelte`) : la liste, avec adresse, lien
  vers la carte et nombre de sessions et d'événements qui portent chaque lieu. Visible de
  tout membre
- **Gérée par l'admin du groupe** (`canManageGroup`), comme le nom, le logo et les liens :
  ajouter, modifier, retirer. L'adresse se cherche dans la Base Adresse Nationale
  (`AddressField.svelte`) ou se saisit à la main — hors de France, par exemple —, sans carte
  alors. Une étiquette est unique dans le groupe, casse ignorée (`409`)
- **Renommer** un lieu renomme aussi les sessions et événements qui le portent : sans cela,
  ils perdraient son adresse, et le lieu ses sessions
- **Retirer** un lieu (confirmation `warning`) ne touche pas aux sessions : elles gardent le
  nom, et perdent l'adresse
- À la migration, tout lieu déjà employé **au moins deux fois** dans un groupe en devient
  un lieu, sans adresse ; un lieu employé une seule fois reste un simple texte. La liste se
  trie ensuite depuis `/group`

### Affichage

- Dans l'en-tête d'une session, **l'étiquette seule** : « Chez Élise » dit assez où l'on
  joue au groupe qui l'a nommée, et l'adresse complète alourdissait l'en-tête. L'adresse
  reste au survol. Dans le panneau du jour de l'agenda, elle suit le lieu
- S'il y a des coordonnées — adresse du lieu du groupe ou adresse ponctuelle —, le lieu
  ouvre la carte OpenStreetMap dans un nouvel onglet
- Une **indisponibilité** peut porter une adresse ponctuelle, jamais l'adresse d'un lieu
  du groupe : son lieu est personnel
- La recherche passe par notre serveur (`src/lib/server/addresses.ts`) : seul le texte tapé
  part chez l'IGN. Déclaré dans la politique de confidentialité
- Les lieux partent avec le groupe (`ON DELETE CASCADE`). Ils n'entrent pas dans l'archive
  JSON d'un groupe

## Liste des sessions (`/sessions`)

- Liste des sessions du groupe actif en deux sections. **À venir** (date du jour comprise,
  à l'heure de l'appareil) : la plus proche d'abord, chaque carte disant le temps qui
  reste (« Demain », « Dans 5 jours ») plutôt que « 0 prise ». **Passées** : la plus
  récente d'abord, regroupées par année, avec des pastilles pour sauter à une année
- **Retrouver une session passée** : « Rechercher », à droite de l'intitulé « Passées »,
  déplie la barre de recherche et les filtres par type — repliés par défaut, on parcourt
  la liste plus souvent qu'on n'y cherche. « Fermer » (ou Échap sur un champ vide) la
  replie **et efface la recherche** : un filtre actif derrière une barre repliée cacherait
  des sessions sans le dire. Le champ cherche, sans casse ni accents, dans
  les **morceaux joués**, le lieu, les présents, le titre, les notes, le type et la date
  en toutes lettres (« mars », « 2025 », « samedi »). Chaque mot doit se trouver quelque
  part : « sunny elise » = Sunny joué chez Élise. Les morceaux désignés par la recherche
  s'affichent sous la carte — c'est le plus souvent eux qu'on cherche. Les filtres par
  type s'y ajoutent. Tout se fait côté client, la liste étant chargée en entier, et la
  recherche est rétablie au retour d'une session (`snapshot` SvelteKit)
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
- Chaque morceau s'ouvre comme un **album** : pochette générée (`SongCover.svelte`),
  l'interprète en surtitre — le **groupe**, suivi de « reprise de … » pour une reprise
  (`songAlbumArtist`, `src/lib/songs.ts`) ; les auteurs d'une composition restent sur la
  page du morceau —, titre, nombre de prises et durée cumulée, et un bouton rond **« tout
  écouter »** (`PlayAllButton.svelte`). Pas d'image en base : la pochette est un dégradé
  dont la teinte se tire de l'id du morceau — la même d'une page à l'autre, et inchangée
  quand on renomme un morceau « À nommer » (qui porte « ? » en initiale)
- « Tout écouter » enchaîne les prises avec piste audio dans le mini-lecteur, dans
  l'ordre affiché ; ⏭ passe à la suivante. Le bouton met en pause la série qu'il a lancée
  et la reprend. Une prise lancée seule remplace la file au lieu de s'y ajouter, et
  l'enchaînement s'arrête sur la page d'une prise, dont la waveform montrerait sinon une
  autre prise que celle qu'on entend (`src/lib/player.svelte.ts`)
- Modification possible : date, type, titre, lieu, notes, membres de la session
  (mêmes vignettes qu'à la création — `src/lib/components/MembersInput.svelte`)
- Modification possible par prise : la **qualité libre**, et elle seule. Elle se règle
  uniquement dans cette vue ; l'historique d'un morceau est en lecture seule. La note d'une
  prise, elle, s'écrit dans le lecteur — voir « Note d'une prise »
- **En-tête de page commun** aux pages qui listent des prises — session, morceau, playlist
  (`MediaHeader.svelte`) : un visuel carré, la nature de la page en petites capitales, le
  titre, ce qu'elle contient en chiffres, et le ▶ rond orange. Posé sur un **bandeau**
  plus foncé que la page, teinté comme son visuel : la teinte de la pochette pour un
  morceau (`songHue`, `src/lib/songs.ts`), la couleur du type pour une session (gris
  clair pour « Autre »). Une playlist et le référentiel, qui n'ont pas de teinte propre,
  prennent un **bandeau encre**, la couleur de la barre latérale, texte clair : il les
  distingue des pages d'un morceau ou d'une session, toujours claires. La même grammaire que
  l'en-tête « album » de chaque morceau dans une session, à l'échelle de la page. Le
  visuel d'une session est un **feuillet d'éphéméride** (mois, jour, jour de la semaine,
  et l'année hors de l'année en cours) teinté comme son type (`SessionCover.svelte`) : une
  session n'a pas de pochette. Il est **seul à porter la date** : l'en-tête ne la répète
  pas sous le titre, où ne restent que le lieu et les présents. Il l'annonce en entier
  aux lecteurs d'écran (`role="img"`)
- La disposition suit la **largeur de l'en-tête** (requête de conteneur), pas celle de la
  fenêtre. Large : visuel, texte, commandes sur une rangée. Sous 720 px, les commandes
  secondaires se réduisent à leur icône. Sous 600 px, le visuel ne garde à côté de lui
  que le libellé, le titre et les chiffres ; les détails (date, lieu, présents,
  compositeur…) prennent toute la largeur dessous, et les commandes leur propre rangée,
  calées à droite. Laisser les commandes à côté du texte réduisait celui-ci à une colonne
  où le titre se coupait au milieu des mots
- Chiffres de l'en-tête : nombre de morceaux, de prises et durée totale enregistrée. Son ▶
  enchaîne toute la session, morceau après morceau, dans le mini-lecteur
- **Pas de paroles ni de notes musicales** sous les morceaux : on vient ici réécouter et
  comparer des prises, et des paroles dépliées sous chaque morceau poussaient les prises
  hors de l'écran. Elles se lisent sur la page du morceau, sur la prise et en playlist
- **Photo de bandeau** : voir « Photo de bandeau d'une session » plus bas
- Ajout d'une prise oubliée à une session passée : autorisé. « + Ajouter une prise » ouvre
  `/upload?session_id=` avec la session déjà sélectionnée (ignoré si hors du groupe actif).
  Le bouton est au-dessus de la liste des prises (sous le sommaire des morceaux), pas en
  pied de page : sous une session de vingt prises, il fallait tout faire défiler pour le
  voir. Même place et même poids (`btn-primary`) que sur la page d'un morceau
- Une prise est une **piste de tracklist**, pas une ligne de tableau (`RecordingRow.svelte`,
  partagé avec la vue morceau) : sans cadre, un fond au survol. Colonne de tête pour le
  numéro, puis « Prise n » — lien vers le lecteur complet — avec la provenance en gris
  dessous (fichier, déposant), les pastilles (qualité, note, commentaires), les commandes, et la **durée calée à droite** en
  chiffres alignés. Elle ne redevient une carte que dépliée, pour que le tiroir des
  commentaires ait des bords à rejoindre. La grille se replie sur la largeur de la ligne
  (requête de conteneur) : ligne étroite, les pastilles passent sous le titre — jamais de
  défilement horizontal. Voir « Commandes d'une prise » plus bas et « Tableaux et mobile »
  dans docs/conventions.md
- **La prise en cours se voit** : un égaliseur orange remplace son numéro (figé en pause,
  immobile avec `prefers-reduced-motion`), son titre passe en orange et la ligne prend un
  fond orangé pâle. Le ▶ d'une prise qui joue devient ⏸
- Chaque prise affiche le **nom du fichier déposé** (`recordings.source_file_name`), tronqué
  et donné en entier au survol : `file_path` vaut toujours `{id}.mp3`, unique mais muet sur
  la provenance. Les prises antérieures à la migration 023 n'ont pas de nom d'origine — il
  n'a jamais été écrit — et retombent sur `{id}.mp3`, en italique grisé
- La **qualité** est une pastille : elle ne devient un sélecteur qu'au clic. Une valeur qui
  change rarement n'a pas à occuper la largeur d'un menu déroulant sur chaque ligne
- **Une prise neuve n'a pas de qualité** (`status` NULL, migration 048) : pas de pastille,
  rien n'est à lire. Elle naissait « À revoir », ce qui ne disait rien puisque personne ne
  l'avait choisi, et ôtait son sens à un vrai « À revoir ». À la place, un « + Qualité » en
  pointillés, comme « + 📝 » (au survol à la souris, dans le menu ⋮ sous 640 px). Le
  sélecteur propose « Sans qualité » pour la retirer (`PATCH` avec `{ status: null }`)
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

### Photo de bandeau d'une session

Le bandeau d'une session prend la teinte de son type. Tout membre du groupe peut y poser
une photo — la salle, la scène, le groupe en répétition —, comme il modifie le titre ou le lieu.

- **Tant qu'il n'y a pas de photo**, « Photo » dans les actions de l'en-tête
  (`SessionPhotoAdd.svelte`) ouvre directement le choix du fichier, qui part aussitôt
- **Une photo posée ne se change qu'en mode édition** (« Modifier ») : le bouton de l'en-tête
  disparaît, pour qu'un clic égaré ne remplace pas le bandeau. Le formulaire porte
  « Photo du bandeau » (`SessionPhotoField.svelte`) : remplacer, retirer, régler le voile
- En édition, le **bandeau s'affiche en aperçu** au-dessus du formulaire, tel qu'il sera
  enregistré : titre, type, lieu, présents, photo choisie et voile y changent en direct
- Rien n'est appliqué avant « Enregistrer » — photo choisie, retrait, voile —, et « Annuler »
  abandonne tout comme le reste du formulaire. C'est pourquoi retirer ne demande pas de
  confirmation : la teinte revient, et la photo se redépose
- **Voile sombre réglable** par session, de 20 à 95 % d'opacité au bord gauche (75 % par
  défaut, `SESSION_PHOTO_VEIL`, `src/lib/session-photo.ts`) : une photo déjà sombre s'en
  passe presque, une photo claire en demande davantage. Le plancher garde le titre lisible.
  Régler le voile ne change pas la version de l'image, qui reste en cache
- PNG, JPEG, WebP ou GIF, **8 Mo** au plus ; format lu dans les octets, SVG refusé
- **Adaptée au format sans intervention** : ffmpeg la recadre au centre en 1600 × 600 et la
  réencode en JPEG, en appliquant l'orientation d'une photo de téléphone. L'original n'est
  pas gardé, ni ses métadonnées (EXIF, position GPS). L'écran recadre encore au centre
  (`background-size: cover`) : le bandeau est plus allongé sur ordinateur (≈ 6:1) qu'au
  téléphone (≈ 3,5:1), et 8:3 garde de quoi remplir les deux sans couper les têtes au téléphone
- Le **voile sombre**, plus dense à gauche où se lit le titre, passe le texte en clair :
  une photo n'a pas de ton garanti, le contraste ne doit pas en dépendre (`MediaHeader`,
  props `photo` et `photoVeil`)
- En base (`session_photos`, migrations 037 et 038), comme une pochette : elle suit la session dans
  `pg_dump` et part avec elle. Elle n'entre pas dans l'archive JSON d'un groupe
- Servie par `GET /api/sessions/[id]/photo` aux **seuls membres du groupe**, `?v=<version>`
  pour un cache long. Rien n'est public
- Pas de notification : une photo n'annonce pas de nouveau contenu

### Commandes d'une prise, et menu ⋮ sous 640 px

**Au-dessus de 640 px, toutes les commandes sont sur la ligne** : pastille 📝 (ou « + 📝 »
en pointillés s'il n'y a pas de note), 💬 (ou « + 💬 »), écouter ▶, ouvrir le lecteur
complet, ajouter à une playlist, partager (🔗, voir « Partager une prise »). La place ne
manque pas, rien n'a à être caché.

**À la souris** (`@media (hover: hover) and (pointer: fine)`, pas une largeur), la ligne se
lit comme une piste de streaming : le numéro devient ▶ au survol et remplace le bouton ▶ de
droite, et ce qui s'écrit ou s'ouvre ailleurs (« + 📝 », « + 💬 », playlist, partage) ne
paraît qu'au survol ou au focus clavier. Le **lecteur complet** fait exception : c'est
l'accès principal à la prise, pas une commande secondaire. Son bouton (icône forme
d'onde, pas la flèche « externe », qui promettait un autre site) reste visible, en
dernier contre la durée, et « Prise n » y mène aussi, comme le titre du mini-lecteur. **Au doigt**, rien de tout cela : un
`:hover` collant demanderait deux touchers pour lancer la lecture. Le numéro reste un
numéro et le ▶ un vrai bouton, à toutes les largeurs — tablette en paysage comprise.

**Sous 640 px**, les mêmes commandes demandent 242 px de cibles tactiles là où la carte en
offre 274 au plus : la ligne ne garde alors que ce qu'il y a **à lire** — 📝 s'il y a une
note, 💬 s'il y a des commentaires — plus l'écoute, et un menu ⋮ recueille le reste.

- **Composition stable** du menu, indépendante de ce que la prise contient déjà : ouvrir le
  lecteur complet, ajouter à une playlist, donner ou changer la qualité (vue session
  seulement), ajouter ou modifier la note, ajouter un
  commentaire, copier le lien pour le groupe, lien d'écoute public (si la prise a de
  l'audio et qu'on peut partager). Un menu qui ne grouperait que les ajouts fondrait à une seule entrée sur une
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
- **Un seul mode édition**, ouvert par « Modifier » dans l'en-tête : la fiche de la session
  (date, type, titre, lieu, présents, notes, photo) s'ouvre sous le bandeau, et les prises
  prennent en même temps leur bouton de suppression. Deux boutons « Modifier » sur la même
  page — l'un pour la session, l'autre pour ses prises — laissaient deviner lequel faisait
  quoi. « Enregistrer » ou « Annuler » en sort
- Supprimer une prise, en mode édition, demande toujours une **confirmation `danger`**,
  qui nomme ce qui part avec elle. Une fois confirmée, la suppression ne passe pas par
  « Enregistrer », qui ne vaut que pour la fiche : « Annuler » ne rend pas une prise supprimée.
  Le numéro reste global au morceau et n'est pas renuméroté
- « Supprimer la session » est au bout des boutons du formulaire d'édition, à l'écart
  d'« Annuler », comme « Supprimer le morceau » sur la page d'un morceau : hors édition,
  rien de destructeur sur la page
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
- En-tête de page commun (voir « Vue session ») : pochette générée, statut et tonalité
  dans le libellé, prises, sessions et durée cumulée en chiffres. Son ▶ enchaîne toutes
  les prises dans l'ordre de la page (les plus récentes d'abord)
- **À plat**, sans intertitre de session : chaque prise se **titre par sa session** (date,
  en lien vers elle), avec « Prise n · lieu · déposant » dessous — comme une piste de
  playlist se titre par son morceau. « Prise n » y mène au lecteur complet. Le nom du
  fichier déposé passe en infobulle ; il se lit en vue session
- **La fiche du morceau s'y modifie** : « Modifier » dans l'en-tête, comme sur une session,
  ouvre sous l'en-tête le même formulaire que le tableau de `/songs` (`SongFields.svelte`,
  recherche Deezer comprise) — titre, compositeur, tonalité, statut, reprise, année,
  durée, paroles et accords. Les commandes de l'en-tête s'effacent le temps de l'édition ;
  rien n'est appliqué avant « Enregistrer », « Annuler » rend la fiche telle qu'elle était.
  « Supprimer le morceau » s'y trouve aussi, aux mêmes conditions qu'en `/songs` : sans
  prise, après confirmation `danger`, puis retour au référentiel. Les deux écrans passent
  par les mêmes règles serveur (`parseSongForm`, `updateSong`, `src/lib/server/songs.ts`)
- Mêmes pistes que la vue session (`RecordingRow.svelte`, prop `session`), en lecture seule :
  la qualité s'y lit en badge (aucun sans qualité), sans sélecteur, et aucune action
  d'édition n'y figure
- Les prises affichent leur libellé de qualité libre et leur note
- Le compteur de commentaires déplie la liste des commentaires de la prise, sans ouvrir le
  lecteur — mêmes 5 derniers qu'en vue session, avec le renvoi vers le lecteur au-delà
- Même menu ⋮ qu'en vue session — voir « Menu d'une prise » plus haut
- **« + Ajouter une prise » et « Ajouter à une setlist »** au-dessus de la liste des prises,
  pas en pied de page : sous un morceau très enregistré, il fallait tout faire défiler pour
  les trouver. Au téléphone, ils restent côte à côte tant qu'ils tiennent. Une setlist
  programme des **morceaux**, pas des prises : l'action appartient donc à la page du morceau,
  là où les lignes de prises portent celle des playlists. Même sélecteur que pour une playlist
  (`AddToSetlistButton.svelte`) : les setlists qui programment déjà le morceau sont marquées,
  et on peut en créer une sans quitter la page. Un morceau `abandonne` n'affiche pas le bouton,
  comme il ne se propose pas au dépôt d'une prise

## Pochette d'un morceau

Sans pochette, un morceau a un dégradé dans sa teinte (`songHue`) avec son initiale. Tout
membre du groupe peut lui donner une vraie image, comme il gère le reste du référentiel.

- « Pochette » dans l'en-tête de `/songs/[id]` (`SongCoverEditor.svelte`) : choisir une
  image, la remplacer, la retirer. Retirer ne demande pas de confirmation : le dégradé
  revient, et l'image se redépose
- PNG, JPEG, WebP ou GIF, **8 Mo** au plus — une photo de téléphone dépasse vite les 2 Mo du
  logo. Le format est lu dans les octets ; SVG refusé
- L'image est **recadrée en carré au centre** et réencodée par ffmpeg en deux JPEG : 512 px
  pour les en-têtes, 160 px pour les listes et le mini-lecteur. L'original n'est pas gardé
- En base (`song_covers`, migration 036), comme le logo : elle suit le morceau dans
  `pg_dump` et part avec lui. Elle n'entre pas dans l'archive JSON d'un groupe
- Servie par `GET /api/songs/[id]/cover` aux **seuls membres du groupe** — contrairement au
  logo, rien n'est public. `?v=<version>` pour un cache long ; le mini-lecteur, qui ne
  connaît pas la version, demande l'URL sans elle et se contente d'un cache de 5 min
- `SongCover` pose l'image par-dessus le dégradé : tant qu'elle charge, ou si elle manque,
  le dégradé tient la place. Toutes les pochettes en profitent — listes, en-têtes, mini-lecteur

### Retrouver une reprise dans le catalogue Deezer

Pour une reprise, retaper l'artiste, l'année et la durée est fastidieux : le catalogue
public de Deezer (API sans clé) les connaît.

- **Formulaire d'un morceau** (ajout et tableau de `/songs`, édition sur la page du
  morceau), une fois « Reprise » choisi : « Rechercher une reprise sur Deezer »
  (`CatalogSearch.svelte`). Choisir un résultat remplit titre (sans mention de version,
  `title_short`), artiste d'origine, année et durée de référence ; les champs restent
  modifiables. Le compositeur n'est pas repris : Deezer ne connaît que les interprètes
- La pochette de l'album du titre choisi est **importée à l'enregistrement** (« Ne pas
  l'importer » pour s'en passer). Son échec ne défait pas l'enregistrement : l'écran le
  dit, et la pochette se redépose depuis la page du morceau
- **Fenêtre « Pochette »** de `/songs/[id]` : la recherche y part d'emblée sur le titre et
  l'artiste d'origine, et choisir un résultat importe sa pochette
- Les résultats montrent l'**album** : une compilation (« Number 1's », 2007) arrive souvent
  avant l'original (« Talking Book », 1972), et c'est lui qui donne la bonne année
- **Année** : la plus ancienne entre celle du titre et celle de l'album — la première est
  souvent celle de la réédition numérique. Elle ne vient que du détail d'un titre
  (`GET /api/catalog/tracks/[id]`) : la recherche ne la donne pas
- Tout passe par notre serveur (`src/lib/server/deezer.ts`) : seul le texte cherché part
  chez Deezer. La pochette est importée **par l'id du titre**, jamais par une URL venue du
  navigateur, et seulement depuis le CDN d'images de Deezer (`*.dzcdn.net`) : le serveur ne
  télécharge pas n'importe quoi. Les vignettes des résultats, elles, viennent directement
  de Deezer — déclaré dans la politique de confidentialité
- Pas dans la création rapide d'un morceau (« + Nouveau morceau… » pendant un envoi) :
  c'est un geste de répétition, pressé, pas un moment de catalogage

## Feuille de répétition (`/songs/[id]/partition`)

Ce qu'on pose sur le pupitre : les paroles avec les accords placés au-dessus, les sections
dans l'ordre du morceau, et au besoin quelques mesures de partition. Une feuille par
morceau (`score_documents.song_id` unique), au groupe : tout membre la crée et la modifie.

- **Elle se lit d'abord.** La page s'ouvre en **lecture** : la feuille mise en forme,
  rendue avec la page, sans l'atelier. « Modifier » ouvre l'**édition** (blocs, source,
  aperçu) ; « Enregistrer » y revient, « Annuler » abandonne tout après confirmation
  `warning` — rien n'est appliqué avant. On vient la suivre en répétition bien plus souvent
  que la corriger, comme une playlist ou le référentiel
- **Transposer** en lecture décale les accords **et** les mini-partitions (`visualTranspose`
  d'abcjs), pour l'écran comme pour l'impression, sans toucher la feuille enregistrée. Pour
  réécrire les accords d'un bloc, c'est « Appliquer au bloc » en édition
- **Dernière modification** sous le titre : « Modifiée aujourd'hui à 14:05 par Julie »,
  « hier à 09:12 », « le 17 sept. à 12:35 » (`formatModifiedAt`, `src/lib/date.ts`), la
  date complète au survol ; en édition, l'aperçu dit « Enregistrée … ». Tout membre
  modifie la feuille : la date seule ne dit pas à qui demander ce qui a changé. Moment et
  auteur sont posés à chaque enregistrement (`updated_at`, `updated_by_user_id`, migration
  049), le nom relu dans `users` comme pour un commentaire. Une feuille antérieure à la
  migration, ou dont l'auteur de la modification a supprimé son compte, n'affiche que la
  date : l'auteur de la feuille n'est pas forcément le dernier à l'avoir modifiée. La
  ligne s'imprime aussi : une feuille papier dit de quelle version elle date
- **Afficher : Tout / Paroles / Accords**, en lecture comme au pupitre : chacun lit sa part,
  le chanteur sans les accords, le guitariste sans les paroles. Un filtre d'affichage
  (`lyricLines`, `chordRows`, `src/lib/chordpro.ts`) : la feuille enregistrée ne change
  pas, la transposition s'applique, et l'impression suit — on imprime les paroles seules
  au chanteur. Le choix est gardé dans le navigateur, pour toutes les feuilles ; il ne se
  propose que sur une feuille qui a des accords entre crochets
  - **Paroles** : les accords retirés, les sections gardées. Une ligne qui ne portait que
    des accords disparaît, et les **mini-partitions** aussi — presque toujours des passages
    instrumentaux. Des accords écrits sans crochets (« Intro : D G A », fréquent dans les
    infos musicales reprises de la fiche) ne se distinguent pas du texte et restent
  - **Accords** : une rangée d'accords par ligne de paroles, en colonnes de largeur fixe
    pour qu'ils s'alignent d'une rangée à l'autre. Les rangées identiques qui se suivent
    n'en font qu'une, suivie de « ×2 ». ChordPro ne dit pas où tombent les mesures : on
    garde l'ordre des accords, pas leur place dans la phrase. Les mini-partitions restent
  - Un bloc à qui la vue ne laisse rien disparaît, titre compris
- **Imprimer / PDF** imprime la vue de lecture, jamais les sources. La mise en page papier
  diffère de l'écran sur quelques points :
  - **Une section n'est pas coupée** entre deux pages quand elle tient sur une page, et son
    titre ne reste jamais seul en bas (`chartSections`, `src/lib/chordpro.ts`). Plus longue
    qu'une page, elle se coupe quand même
  - **Une ligne sans accord** ne garde pas la rangée d'accords vide qui l'aligne à l'écran :
    un couplet sans accords en prenait deux fois la hauteur
  - **Tailles en points** : paroles 12 pt, accords 10 pt — les accords à la taille de l'écran
    (9 pt) se lisaient mal à bout de bras
  - **La transposition et la vue** (« Transposée de +2 demi-tons · Paroles seules ») sont
    écrites sous le titre : rien d'autre ne dirait sur papier qu'une feuille n'est pas dans
    sa tonalité d'origine
  - **Ni date, ni URL, ni titre d'onglet** : la page n'a pas de marge (`@page { margin: 0 }`),
    donc pas de place pour l'en-tête et le pied de page du navigateur, qui ne s'impriment pas.
    La marge est portée par la feuille, et répétée sur chaque page
    (`box-decoration-break: clone`). Pas de numéro de page : il faudrait une marge de page,
    où le navigateur remettrait les siens
- **Clic** au tempo du morceau, quand sa fiche a un **tempo de référence**
  (`songs.tempo_bpm`, migration 050, 20 à 300 BPM) : un bouton « Clic 96 BPM » en lecture
  et au pupitre, rien sans tempo (`Metronome.svelte`, moteur `src/lib/metronome.svelte.ts`).
  Un **témoin** dans le bouton s'allume à chaque battement, pour qui ne l'entend pas par-dessus
  le groupe ou joue au casque. Au repos, ce seul bouton ; en jouant seulement, − / + règlent
  le tempo d'un BPM et « ↺ 96 » ramène à celui de la fiche — le groupe joue rarement au
  tempo exact, et s'en écarter ne modifie pas la fiche
  - Les clics sont posés sur l'horloge de l'audio (Web Audio), pas sur une minuterie, qui
    dériverait à l'oreille ; le témoin suit la même horloge, latence de sortie comprise.
    Onglet en arrière-plan, ils sont posés plus loin d'avance pour ne pas bégayer
  - Un seul clic pour la lecture et le pupitre : ouvrir le pupitre ne le coupe pas.
    « Modifier » l'arrête. Pas de temps fort : la fiche ne dit pas la mesure, et un
    accent sur le mauvais temps gênerait plus qu'un clic égal
- **Pupitre** (action principale de la lecture) : la feuille seule, en plein écran, pour
  une tablette posée sur le pupitre ou un écran au bout de la salle. Ni navigation, ni
  barre du haut, ni mini-lecteur ; une colonne qui défile. L'écran est **gardé allumé**
  (Wake Lock, comme à l'enregistrement, et l'écran dit quand le navigateur ne le permet
  pas). Sans plein écran (iPhone), le pupitre couvre quand même toute la fenêtre.
  « Quitter », Échap ou la sortie du plein écran par le navigateur le referment
  - **Taille du texte** (A− / A+, ou `-` / `+`) : sept paliers de ×1 à ×3, appliqués aux
    tailles de la lecture. La colonne s'élargit avec le texte, et les mini-partitions
    grossissent avec elle. C'est la seule taille de texte réglable de l'application : elle
    dépend de la distance du musicien à l'écran, pas de la feuille
  - **Défilement automatique** (« Défiler », ou Espace). Quand le morceau a une **durée de
    référence** (`songs.reference_duration_s`), la vitesse en est déduite par défaut
    (« Auto ») : toute la feuille défile sur cette durée, et arrive en bas quand le
    morceau finit. Recalculée à chaque image, elle suit le zoom et une gravure ABC arrivée
    en retard. − / + quittent l'automatique pour le palier juste au-dessous ou au-dessus —
    le groupe joue rarement au chrono de la référence —, « Auto » y revient, et chaque
    ouverture du pupitre y revient aussi. Sans durée, huit vitesses manuelles, qui suivent
    la taille du texte : zoomer ne change pas le nombre de lignes lues à la minute. Un doigt
    posé sur la feuille la retient, et le défilement reprend dès qu'on le lève ; arrivé en
    bas, il s'arrête, et relancé il repart du début. Une marge basse d'une demi-page laisse
    la fin du morceau remonter à hauteur d'yeux
  - **Tourner la page** au clavier : → / PageDown, ← / PageUp, d'un écran moins une
    marge, pour garder la dernière ligne lue. C'est ce qu'envoient les pédales de
    tourne-page Bluetooth
  - **Thème sombre** (« Sombre ») : texte clair sur fond sombre, pour une scène ou une salle
    peu éclairée, où une feuille blanche éblouit. Il suit le réglage du système tant qu'on
    ne l'a pas choisi. Propre au pupitre — l'application n'a pas de thème sombre : ce sont
    les tokens de couleur redéfinis sur le pupitre seul, et la gravure ABC prend la couleur
    du texte (`foregroundColor: 'currentColor'`)
  - La transposition et le choix « Afficher » s'y règlent aussi ; la taille, la vitesse
    manuelle et le thème sont gardés dans le navigateur, pour toutes les feuilles
- Une feuille est une suite de **blocs** : « Paroles et accords » en ChordPro (accords
  entre crochets dans le texte, sections par directives `{comment: …}`,
  `{start_of_chorus}`…), ou **mini-partition** en ABC — saisie note à note, source ABC,
  ou import MusicXML/MXL dont l'original est conservé (`score_originals`)
- **Raccourcis de saisie ChordPro**, au-dessus de la source d'un bloc « Paroles et
  accords » : Couplet, Refrain, Pont (`{start_of_verse}` … `{end_of_verse}`, etc.), Rappel
  du refrain (`{chorus}`), Titre de section (`{comment: …}`, « Intro » sélectionné pour
  être remplacé à la frappe) et `[Accord]`. Au téléphone surtout, accolades et crochets
  sont sous deux niveaux de clavier. Seules les directives que le rendu distingue ont le
  leur : tablature et grille s'afficheraient comme du texte
  - Avec une sélection, une section **entoure les lignes entières** touchées ; `[Accord]`
    entoure le texte sélectionné. Sans sélection, une directive se pose **sur sa propre
    ligne** — au début de la ligne si le curseur y est, après elle sinon : elle ne coupe
    jamais une ligne de paroles ni une autre directive. Une section vide s'ouvre curseur
    dedans
  - Ctrl/⌘+Z défait un raccourci comme une frappe (`insertText`), y compris un accord de
    la palette. Le bouton ne prend pas le focus : le clavier du téléphone reste ouvert
  - Pas de raccourci clavier : Ctrl+Alt est AltGr sur un clavier français Windows — celui
    qui tape `[` et `{` —, Option tape des caractères sur Mac, et les combinaisons
    restantes sont prises par le navigateur
- **Fiche et feuille.** La fiche du morceau garde ses deux champs libres, « Paroles » et
  « Accords / infos musicales » (`songs.lyrics`, `songs.music_notes`) : ce sont eux que
  reprennent la page d'une prise, la playlist en cours de lecture et l'envoi d'une prise.
  La feuille est la mise en page de répétition. Une feuille **neuve part de la fiche** —
  un bloc par champ rempli, le texte libre étant déjà du ChordPro valide —, au lieu de
  faire tout retaper. Ensuite, les deux ne se synchronisent pas : « Reprendre la fiche du
  morceau », en édition, insère de nouveau ses deux champs tels qu'ils sont, pour une fiche
  complétée depuis. Le formulaire de `/songs` le rappelle sous ces deux champs
- **Suppression** réservée à son auteur et aux admins du groupe (`canDeleteScoreDocument`),
  en édition, confirmation `danger`. Les paroles et accords de la fiche restent
- La feuille reste au groupe quand le compte de son auteur disparaît (migration 043) ; elle
  part avec le morceau. Elle compte parmi ce qu'on a mis dans un morceau « À nommer » :
  il n'est plus supprimé quand sa dernière prise le quitte
- Un lien vers la feuille d'un autre de ses groupes bascule le groupe actif, comme toute
  page de contenu (voir « Partager un lien vers du contenu »)

## Lecteur audio (`/recording/[id]`)

- WaveSurfer.js initialisé dans `onMount`, importé dynamiquement
- URL audio : `/audio/{recording_id}.mp3`, servie par Node, qui vérifie la session et le
  groupe actif avant d'ouvrir le fichier (Caddy proxyfie ce chemin, il ne le sert pas)
- Commentaires avec `timestamp_s` → marqueurs sur la waveform
- Clic sur un marqueur → seek à ce timestamp + scroll vers le commentaire
- Contrôles : temps écoulé à gauche ; au centre ⏮ retour début | ▶/⏸ (le bouton rond
  orange des en-têtes) | ⏭ +10s ; durée et volume à droite. Mêmes commandes que le lecteur
  vidéo (`.player-controls`, `src/app.css`), pour que les deux ne divergent pas
- La partie lue de la forme d'onde est orange (`--color-accent`), le reste gris : les
  repères de commentaire y sont donc un trait sombre surmonté d'une pastille orange
- Le lecteur reste collé en haut de la page tant qu'il laisse de quoi lire, et la liste peut
  suivre la lecture — voir « Naviguer dans une prise très commentée »
- Ajout de commentaire : global OU ancré à la position courante du lecteur. Le formulaire
  tient en deux lignes au repos — voir « Boîte d'ajout d'un commentaire »
- Mentions : taper `@` dans le commentaire propose les membres du groupe ; la mention insère
  leur pseudo unique (`@pseudo`) et est mise en évidence dans toutes les listes de commentaires.
  Le membre mentionné est notifié (voir « Notifications d'activité ») ; la règle de détection
  est partagée entre affichage et serveur dans `src/lib/mentions.ts`
- Un commentaire est **général par défaut** ; l'ancrer est un choix, et le repère se
  **fige à la première frappe** — voir « Boîte d'ajout d'un commentaire »
- Auteur pré-rempli depuis l'utilisateur connecté
- Le nom du fichier déposé figure sous la ligne de métadonnées de la prise, la note
  de la prise juste en dessous

## Navigation

Trois mises en page, toutes dans `src/routes/+layout.svelte` :

| Largeur | Navigation |
|---|---|
| ≥ 1024 px (ordinateur) | barre latérale complète, en sections « Groupe » et « Moi » |
| 641–1023 px (tablette) | **rail** d'icônes à court libellé (76 px) ; compte, admin et pages légales sous « Plus » |
| ≤ 640 px (téléphone) | **barre d'onglets** en bas : Accueil · Sessions · **+** · Morceaux · Plus |

- **Groupe actif** (`GroupSwitcher.svelte`) : en tête de la barre latérale (pastille seule
  dans le rail), à gauche de la barre du haut au téléphone. Logo et nom ; avec plusieurs
  groupes, un menu pour changer de groupe et « Infos du groupe » (`/group`). Avec un seul,
  c'est un lien vers `/group` — d'où l'absence d'entrée « Mon groupe » dans la navigation
- **Changer de groupe garde la section** (`pathAfterSwitch`, `src/lib/group-switch.ts`) : une
  liste se recharge pour le nouveau groupe, une page de détail — qui appartient à l'ancien —
  ramène à la liste de sa section (`/songs/7` → `/songs`), une page hors groupe (espace perso,
  profil, admin) reste telle quelle. Avant, on revenait toujours au tableau de bord
- **+ Ajouter** (`AddMenu.svelte`) rassemble les créations : Enregistrer (`/record`), Envoyer
  un fichier (`/upload`), Nouvelle session (`/sessions?nouvelle`, modale ouverte), Publier
  dans le groupe (`/fil?publier`). Bouton plein sous le groupe sur ordinateur, « + » dans le
  rail, rond central de la barre d'onglets au téléphone, où le panneau monte du bas. Sans
  groupe actif, ne restent qu'Enregistrer et le dépôt dans l'espace perso
- **Plus** (`/plus`) : ce que la barre d'onglets et le rail ne portent pas. D'abord une
  section au nom du groupe actif — Fil (en tête : il n'a pas d'onglet), Agenda, Playlists,
  Setlists, puis « Membres, lieux et réseaux » (`/group`) —, ensuite « Changer de groupe »
  avec les **autres** groupes seulement, enfin espace perso, profil, admin, déconnexion,
  pages légales et version. Ni le groupe actif ni le tableau de bord n'y sont répétés : la
  barre du haut montre déjà le premier, l'onglet « Accueil » mène au second. Avec un seul
  groupe, la section « Changer de groupe » disparaît. L'onglet s'allume aussi sur chacune
  de ces pages
- Un onglet s'allume sur les pages qu'il contient : une prise est sous « Sessions ». Le lien
  actif porte `aria-current` (`page` sur la page même, `true` dans sa section)
- La cloche des notifications reste dans la barre du haut à toutes les largeurs ; le
  logo BandStash mène au tableau de bord
- **Fil d'Ariane** : un seul chemin par page (une prise : « Sessions / date / Morceau ·
  Prise n », le morceau se rejoint par le titre de l'en-tête). Au téléphone, il se réduit à
  la page parente, « ‹ Sessions » (`.breadcrumb`, `src/app.css`) : tronqué, le chemin
  complet ne disait plus rien
- Les pages de passage (`/upload`, `/record`) nomment la page d'où l'on vient
  (« Session », « Morceaux »…, `src/lib/back-link.ts`) et y reviennent par l'historique,
  position de défilement comprise. Ouvertes directement : la session demandée, sinon le
  tableau de bord

### Nouvelle version en ligne

Un onglet reste ouvert des jours — le téléphone d'une répétition à l'autre. Après un
déploiement, l'application qu'il a chargée n'est plus celle du serveur, et une navigation
peut viser des fichiers qui n'existent plus.

- L'onglet interroge `/_app/version.json` toutes les 5 min (`kit.version.pollInterval`,
  `svelte.config.js`) et au retour dans l'onglet, où les minuteries ont pu être suspendues.
  La version est l'horodatage du build : tout redéploiement compte, même sans changement
  du numéro affiché
- Une version différente fait paraître un **bandeau discret** en tête du contenu, dans le
  style de celui de la bascule de groupe : « Une nouvelle version de BandStash est en
  ligne. Actualiser la page »
- **Jamais de rechargement imposé** : il couperait la lecture en cours, un enregistrement
  ou un formulaire entamé. Le bandeau se ferme, et ne revient pas dans cet onglet. SvelteKit
  recharge de lui-même une navigation qui échouerait faute des anciens fichiers
- Rien en développement : la vérification n'existe qu'en build

## Partager un lien vers du contenu

Toutes les pages de contenu sont des permaliens (`/recording/12`, `/sessions/4`, `/songs/7`,
`/playlists/3`, `/setlists/5`, `/posts/8`). Trois choses les rendaient inutilisables dès qu'on les envoyait à quelqu'un.

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
  l'annonce — le cookie étant commun aux onglets, la taire serait plus déroutant que le dire.
  Le bandeau peut être fermé avec sa croix ; il réapparaît lors d'une nouvelle bascule par lien
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
- **« Copier le lien pour le groupe »** reprend la position courante du lecteur : partager
  depuis 1:23 partage 1:23 — sur la page de la prise, et sur une ligne de prise si c'est
  elle que joue la barre du bas. Chaque commentaire a le sien, qui porte son repère **et**
  son ancre (`?t=83#comment-5000`) : le destinataire arrive au bon endroit du morceau, pas
  seulement sur la page. Aller chercher l'URL dans la barre d'adresse est la manœuvre qui
  décourage de partager, sur téléphone surtout
- Le presse-papiers demande un contexte sécurisé : s'il est refusé, le lien s'affiche dans un
  champ, sélectionné au focus, pour être copié à la main

### Partager une prise : un seul bouton

Une prise se partage de deux façons — avec le groupe, ou au dehors —, et ce sont deux gestes
de poids très différent : le premier copie un lien, le second crée un accès sans compte. Deux
boutons à long libellé côte à côte prenaient la place de toutes les autres commandes, en
pleine largeur sur téléphone, et la ligne d'une prise ouvrait une modale pour copier un lien.

- **Un bouton 🔗 « Partager »** (`ShareMenu.svelte`) ouvre un petit menu : « Copier le lien
  pour le groupe » (copié d'un geste, le menu confirme puis se referme) et « Lien d'écoute
  public… », qui ouvre sa gestion (`ShareLinkDialog.svelte`). Ce second choix n'apparaît qu'à
  qui peut partager (`canSharePublicly`) une prise qui a de l'audio
- Sur la page de la prise, le bouton garde son libellé à toutes les largeurs, sans s'étirer ;
  le nombre de liens publics actifs y figure en pastille 🌐
- Sur une ligne de prise, c'est une commande comme les autres : au survol à la souris, dans
  le menu ⋮ sous 640 px

Rien de tout cela ne sort du groupe : `/audio/` vérifie la session et le groupe actif comme
le reste. Partager, ici, veut dire partager avec les membres du groupe. Pour faire écouter
une prise à quelqu'un qui n'a pas de compte, c'est un autre lien — voir « Lien d'écoute
public ».

## Lien d'écoute public (`/ecoute/[token]`)

Faire écouter une prise à qui n'a pas de compte : un programmateur, un ami, un ancien
membre. C'est la **seule** porte de l'application qui s'ouvre sans connexion.

- **Un fichier audio, rien d'autre.** La page montre le lecteur (waveform), le titre, la
  date, et pour une prise le nom du groupe et le numéro de prise. Ni commentaires, ni note,
  ni participants, ni lien vers le reste de l'application. Un bouton **télécharge** le
  fichier, nommé d'après le titre (« Sunny - prise 3.mp3 ») plutôt que `{id}.mp3`
- **Qui partage** (`canSharePublicly`, `src/lib/types.ts`) : une prise est au groupe
  entier, **tout membre** peut créer ou révoquer ses liens, quel qu'en soit l'auteur. Un
  enregistrement perso, **son propriétaire seul**. Les admins n'ont rien de plus
- On y arrive par le menu « Partager » d'une prise (voir « Partager une prise : un seul
  bouton »), et par le bouton « Lien public » de `/perso/[id]` — un enregistrement perso n'a
  pas de lien pour le groupe. Tous deux ouvrent la gestion des liens (`ShareLinkDialog.svelte`)
- Dès qu'un lien est actif, son nombre se voit, **de tous les membres** : une prise écoutable
  au dehors ne doit pas l'être à l'insu des autres. Pastille 🌐 n sur le bouton de la page, et
  sur la ligne de la prise parmi les pastilles à lire, à toutes les largeurs — elle n'y paraît
  que s'il y a un lien, et ouvre leur gestion à qui peut partager
- **Un jeton, pas un drapeau.** Les ids se suivent et se devinent ; le jeton fait 192 bits
  aléatoires. Une table (`share_links`, migration 033) plutôt qu'un id signé : un lien se
  révoque seul, sans toucher au secret des sessions
- **Un lien se recopie**, il ne se recrée pas à chaque partage : chaque lien actif porte
  « Copier », pour tout membre qui peut partager. Le lien est copié d'office à sa création,
  et s'affiche dans un champ si le presse-papiers est refusé. La liste montre aussi la date
  de création, l'auteur, l'expiration et la dernière ouverture de chaque lien
- **Jamais en clair en base** : le jeton vaut un mot de passe, et une sauvegarde
  téléchargée ne doit pas publier d'enregistrements. Il est retrouvé par son empreinte
  (SHA-256), et gardé **chiffré** (AES-256-GCM, clé dérivée d'`AUTH_SECRET`, migration 042)
  pour être recopié : sans le `.env` du serveur, la colonne est illisible. Changer
  `AUTH_SECRET` laisse les liens fonctionner mais les rend impossibles à recopier, comme
  ceux créés avant la migration 042 : ceux-là se recréent puis se révoquent
- **Expiration toujours** : 1 semaine, 1 mois ou **6 mois** (défaut). Un lien expiré
  n'ouvre plus rien et disparaît de la liste. **Révoquer** supprime la ligne, après une
  confirmation `warning` : c'est sans retour — un lien recréé a une autre adresse, et
  celui déjà envoyé reste mort
- Le jeton est **revérifié à chaque requête**, page comme fichier : un lien révoqué coupe
  aussitôt, lecture en cours comprise. Lien expiré, révoqué ou inventé : même `404`, aucun
  ne doit se reconnaître
- `Referrer-Policy: no-referrer` (le jeton ne fuit pas par un lien sortant),
  `X-Robots-Tag: noindex`, `Cache-Control: no-store`. Aucun cookie posé
- **Vidéo seule** : pas de lien d'écoute (`400`) — le lien YouTube se partage déjà tel quel
- Le lien tombe avec ce qu'il ouvre (`ON DELETE CASCADE`) : prise, session, groupe,
  enregistrement perso, compte. Un enregistrement perso **classé en prise** garde ses
  liens : ils suivent le son, et se gèrent ensuite comme ceux de toute prise
- Pas de notification au groupe, pas de compteur d'écoutes : la dernière ouverture suffit
  à savoir si un lien sert encore. Les robots qui fabriquent l'aperçu d'un lien collé dans
  une messagerie (WhatsApp, Messenger, Slack, Discord…) ne la comptent pas
- **Aperçu du lien** dans une messagerie : balises Open Graph avec le titre, le contexte
  (groupe, prise, date) et pour image la **miniature du logo du groupe**, ou à défaut
  celle de BandStash (`static/brand/bandstash-og.jpg`, 512 px, ~25 Ko). Rien de plus que
  ce que la page montre déjà. L'URL de l'image est absolue, construite depuis `ORIGIN`

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
- Le **bouton d'envoi est dans le cadre**, en rond à droite. Il est **voisin** de la saisie, jamais posés par-dessus : le texte ne passe pas dessous et
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
- **Où se pose le commentaire** se choisit sous le cadre, entre deux boutons nommés :
  **« ⏱ À 1:23 »** et **« Général »**. Une pastille seule, allumée ou non, ne se
  comprenait pas : on ne savait ni ce qu'elle faisait, ni dans quel état elle était. Le
  choix disparaît quand le lecteur n'a pas de position (rien à ancrer) et sur une cible
  qui ne se lit pas (setlist, suggestion)
- **Le repère se fige à la première frappe.** Avant, il suit la lecture ; dès qu'on écrit,
  il ne bouge plus. On commente ce qu'on vient d'entendre : un repère pris à l'envoi
  tombait 20 ou 30 s plus loin quand on écrivait en écoutant. Si la lecture s'en éloigne
  ensuite (de 2 s ou plus), un commentaire ancré propose « Épingler à 1:58 » pour l'y
  recaler. Vider le champ — ou envoyer — remet tout à zéro
- **Général par défaut** : ancrer est un choix conscient, que l'écran ne fait jamais à la
  place de l'utilisateur — ni selon la pause ou la lecture, ni selon la position. Une fois
  fait, il n'est défait par rien d'autre qu'un clic sur « Général »
- Pendant l'écriture d'un commentaire ancré, un **repère en pointillé** (pastille cerclée)
  apparaît sur la forme d'onde ou la barre de la vidéo, là où il se posera
  (`onDraftAnchorChange`) : il se voit avant d'exister

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

- En-tête de page commun (voir « Vue session ») : visuel fixe (`IconCover.svelte`, l'icône
  playlist sur fond orange) plutôt qu'une mosaïque de pochettes — la pochette d'un morceau
  ferait croire que la page parle de lui —, nombre de prises, durée et auteur
- **Deux modes.** Par défaut, la playlist **se lit** : des pistes comme les prises d'une
  session (`PlaylistTrackRow.svelte`, même colonne de tête `TrackLead.svelte`), avec morceau,
  prise, date, lieu, note de playlist, qualité et durée. « Prise n » et le bouton forme
  d'onde, toujours visible, mènent au lecteur complet. « Modifier » passe en **mode
  édition** (`PlaylistQueue.svelte`) : réordonner, retirer, ajouter des prises. Un geste de
  lecture ne doit rien déplacer par mégarde
- Lecture en continu **par le mini-lecteur** : le ▶ de l'en-tête enchaîne la playlist dans
  l'ordre `position`, le ▶ d'une piste l'enchaîne à partir d'elle, ⏭ passe à la suivante.
  La lecture survit donc à la navigation, comme celle d'une session. Pas de forme d'onde
  sur cette page — le chargement ne calcule plus les pics de chaque prise
- Pendant l'écoute, les **paroles et notes** du morceau en cours s'affichent sous l'en-tête
  (« En cours ») : c'est en répétant sur une playlist qu'on en a besoin
- Ordre modifiable par drag & drop en mode édition → PATCH `position`. Toucher une piste en
  mode édition la lance quand même : on réécoute pour décider de l'ordre
- Ajout d'une prise depuis trois contextes : sa page `/recording/[id]`, chaque ligne de prise
  des vues Session et Morceau, ou directement depuis la playlist (recherche par morceau/date)
- Le sélecteur indique les playlists qui contiennent déjà la prise, permet d'en créer une sans
  quitter le contexte, et empêche les doublons ; une nouvelle playlist et sa première prise sont
  créées dans la même transaction
- Toucher une piste lance la lecture ; « × » la retire de la playlist en mode édition. Le
  retrait est immédiat, sauf si la piste porte une note de playlist : une confirmation
  `warning` la cite, puisqu'elle serait perdue
- **Suppression** réservée à son auteur et aux admins du groupe (`canDeleteGroupContent`),
  comme une setlist : le bouton n'apparaît pas aux autres et l'API répond `403`. Elle se
  propose en mode édition (ou sur une playlist vide), avec une confirmation `danger` qui
  dit ce qui est perdu : l'ordre et les notes de playlist. Les prises restent dans leurs
  sessions — une playlist ne fait que les désigner. Ses notifications partent avec elle

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
- Un morceau se programme depuis la setlist (sélecteur de `/setlists/[id]`) **ou** depuis le
  référentiel — la liste `/songs` comme la page d'un morceau `/songs/[id]` —, qui liste les
  setlists du groupe en signalant celles où il figure déjà. Une setlist et son premier morceau
  se créent dans la même transaction, comme pour une playlist

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

## Espace personnel (`/perso`)

Un carnet à soi, hors de tout groupe : les idées enregistrées au salon, une partie
travaillée seul, une vidéo repérée. Rien n'y est partagé tant qu'on ne le publie pas.

- **Personnel, pas groupe-scopé** : `/perso` montre les enregistrements de l'utilisateur
  connecté, quel que soit le groupe actif, et à lui seul. Aucun admin — global compris —
  ne voit l'espace d'un autre. Un enregistrement d'autrui répond `404`
- Un enregistrement perso (`personal_recordings`) a un **titre**, une **note** libre, une
  piste audio, une vidéo YouTube, ou les deux — comme une prise, contrainte
  `personal_recordings_source`. Il n'a **ni session, ni morceau, ni numéro de prise** :
  ce n'est pas une prise du groupe, et il ne se numérote avec rien
- Trois façons d'en ajouter : déposer un fichier, **enregistrer en direct** (le même
  `AudioRecorder` que `/record`, même copie de secours), coller un lien YouTube. Même
  chemin que l'upload d'une prise : réception en flux, conversion mp3 192 kbps, durée
  ffprobe, doublon par hash — ici **dans son propre espace** (`409`)
- Un fichier ou un enregistrement qui contient **plusieurs morceaux** se découpe sur les
  blancs, chaque passage devenant un enregistrement perso — voir « Découpe vers l'espace perso »
- Les fichiers vivent dans `AUDIO_DIR/perso/{id}.mp3` et sont servis par
  `/audio/perso/{id}.mp3`, **toujours par Node**. La route laisse passer le propriétaire,
  et un membre du **groupe actif** si l'enregistrement y est publié — rien d'autre. Le
  lecteur perso a son propre `<audio>` : un enregistrement perso n'entre ni dans la barre
  du bas ni dans une playlist
- Titre et note se modifient depuis `/perso/[id]`, par le propriétaire seul
- L'en-tête de la liste affiche l'**espace disque** occupé par ses pistes audio. Un
  enregistrement publié compte chez son propriétaire, jamais dans le volume du groupe

#### Classer un enregistrement perso dans une session

Le carnet sert aussi à capter ce qu'on n'a pas eu le temps de ranger : la session qu'on a
oublié de créer avant de jouer, l'idée venue seule. Elle se range après coup.

- **« Classer dans une session »** depuis la page de l'enregistrement, depuis sa ligne dans
  `/perso`, et d'emblée après un enregistrement fait sur place (`/perso/[id]?classer`,
  comme `?publier`). La modale demande la session — existante ou créée à la volée — et le
  morceau, avec la création de morceau sur place (voir « Morceau absent du référentiel »).
  Elle propose la session tenue **le jour de l'enregistrement** (sa création moins sa
  durée), pas celle du jour où on le classe : on range souvent après coup
- L'enregistrement **déménage** : le fichier passe de `AUDIO_DIR/perso/` à `AUDIO_DIR`, la
  prise le remplace, la ligne perso disparaît. Un seul exemplaire du son, une seule place
- Ses **publications partent avec lui**, et leurs commentaires : la modale les nomme avant
  de valider. La prise, elle, se commente dans le groupe
- Une prise n'a pas de titre — elle s'appelle « morceau, prise n ». Le titre et la note de
  l'enregistrement finissent donc dans la **note de la prise**, plutôt que d'être perdus
- Le même son déjà déposé comme prise du groupe (`file_hash`) répond `409`, comme à l'upload
- Le fichier est copié **dans la transaction**, avant le point de non-retour : un échec
  laisse l'enregistrement perso entier, et la copie inachevée est effacée. Les octets
  d'origine ne partent qu'une fois la prise acquise
- Une notification `recording` au groupe, comme pour un upload
- **Supprimer** un enregistrement perso emporte son fichier, ses publications, leurs
  commentaires et leurs notifications : la confirmation (`danger`) dit combien. C'est le
  sens du choix « renvoi plutôt que copie » : l'auteur garde la main sur ce qu'il a publié
- La suppression d'un compte emporte son espace, fichiers compris

## Publications (`/posts/[id]`)

Ce qu'un membre apporte au groupe depuis l'extérieur des répétitions. Trois types :

| Type | Contenu |
|---|---|
| `recording` | un enregistrement de son espace perso, par **renvoi** (pas de copie du fichier) |
| `youtube` | une vidéo YouTube, sans passer par l'espace perso |
| `song_suggestion` | un morceau à proposer : titre, artiste d'origine, lien YouTube pour l'écouter |

Chacune porte un **message** facultatif (« écoutez le pont, j'ai changé les accords »).

- Publiée dans le **groupe actif**, depuis le fil (`/fil`, « + Publier »), depuis `/perso`
  (« Publier dans … ») ou depuis la page d'un enregistrement perso. Un même enregistrement se publie dans **plusieurs groupes** —
  une publication par groupe, chacune avec sa discussion — mais une seule fois par groupe
  (`UNIQUE (group_id, personal_recording_id)`, `409`)
- Publier **depuis un enregistrement précis** (bouton de sa ligne ou de sa page) ne
  redemande ni le type ni l'enregistrement : il ne reste que le message. Depuis le bouton
  général, les choix sont « Enregistrement », « Nouveau lien YouTube » et « Suggestion de
  morceau ». Une vidéo de l'espace publiée porte le badge « Vidéo » côté groupe
- Un **enregistrement** vient de trois sources : « Déjà dans mon espace » — une vidéo déjà
  rangée s'y trouve, avec la mention « (vidéo) » —, « Fichier » ou « Enregistrer » (le même
  `AudioRecorder`, même copie de secours). Un fichier déposé ou enregistré là est **rangé
  dans l'espace perso puis publié** : pour dire « je viens d'enregistrer une idée, écoutez »,
  on n'a plus à passer par `/perso`. L'espace reste l'endroit où il vit — la publication
  le désigne sans le copier, et le supprimer de l'espace retire la publication
- Ces deux étapes passent par les routes existantes (`POST /api/personal` puis
  `POST /api/posts`), **rien de neuf côté serveur**. Si la publication échoue après l'envoi,
  rien n'est perdu ni à moitié fait : l'enregistrement est entier dans l'espace, l'écran le
  dit, et « Publier » ne refait que la publication, sans renvoyer le fichier
- Le formulaire ne se ferme ni à Échap ni au clic à côté pendant un enregistrement ou un
  envoi : ce qu'on vient de capter ne doit pas tenir à une touche
- `/posts/[id]` est un permalien comme les autres : destination conservée à la connexion,
  bascule de groupe actif sur un lien visant un autre de ses groupes
- Lecteur sur la page : waveform pour un enregistrement audio, lecteur YouTube pour une
  vidéo (onglets si l'enregistrement a les deux), rien pour une suggestion sans lien
- **Commentaires** : même espace que ceux d'une prise ou d'une setlist (`CommentsPanel`,
  réactions, mentions, édition). La table `comments` gagne une troisième cible, `post_id`
  (`comments_target` : exactement une des trois). Un commentaire s'**ancre** sur une
  publication qui a un lecteur (audio ou vidéo) ; une suggestion le refuse (`400`) — son
  lien d'écoute est une citation en vignette, comme dans un commentaire, sans position à suivre
- **Pouces** 👍/👎 sur la publication elle-même, pas seulement sur ses commentaires
  (`post_reactions`, migration 032) : réagir sans avoir à écrire. Mêmes règles qu'un
  commentaire — un pouce par membre, re-cliquer le retire, l'autre le remplace. Les noms
  s'écrivent sous les boutons (« Marc, Julie et 3 autres »), lisibles au doigt comme à la
  souris. Pas de notification : un pouce n'annonce pas de contenu. Seules les publications
  en portent — sur une session ou une prise, le signal n'aurait pas de sens
- **Droits** : le message se modifie par l'auteur seul (`canEditPost`). La suppression
  revient à l'auteur et aux admins du groupe (`canDeleteGroupContent`). Retirer une
  publication ne touche jamais l'enregistrement perso qu'elle montre
- Un membre qui quitte le groupe laisse ses publications, comme ses prises
- Sous le lecteur d'un enregistrement publié, une ligne rappelle que ce n'est **pas une
  prise** : il s'écoute et se commente comme elle, mais n'apparaît ni dans les sessions ni
  dans les morceaux, et on l'y chercherait. À son auteur, elle propose de le classer
  (`/perso/[id]?classer`) en disant que la publication et ses commentaires partiront avec lui

### Suggestion de morceau

- Une suggestion **n'entre pas** d'elle-même dans le référentiel : lancer une idée ne doit
  pas remplir `/songs` de titres que personne n'a retenus
- « Ajouter au référentiel » — tout membre — crée le morceau au statut
  `proposition_de_travail`, avec titre et artiste d'origine, et le relie à la
  publication (`posts.song_id`). Le bouton devient alors « Voir le morceau »
- Un morceau du même titre existe déjà dans le groupe : `409`, avec le lien vers lui
- Supprimer le morceau du référentiel délie la suggestion (`ON DELETE SET NULL`), qui
  redevient ajoutable

### Actualité et notifications

- Une notification `post` pour tous les membres sauf l'auteur, à la publication ; les
  commentaires d'une publication notifient `comment` / `mention` comme ailleurs
- L'activité récente du tableau de bord reprend les publications et les commentaires
  qu'elles reçoivent

## Fil d'actualité (`/fil`)

Tout ce qui se passe dans le groupe, du plus récent au plus ancien, en cartes qui se
lisent et se discutent sur place — là où « Activité récente » du tableau de bord ne fait
que signaler, en lignes qui mènent ailleurs. Les deux coexistent : le tableau de bord
reste la vue d'ensemble, et y renvoie par « Tout le fil d'actualité → ».

- Entrée dans la barre latérale, juste sous le tableau de bord. Au téléphone, il n'a pas
  d'onglet : trois chemins le rendent visible de partout — la première entrée de « Plus »,
  « Tout le fil → » à côté du titre « Activité récente » du tableau de bord, et le pied
  du menu des notifications
- **« + Publier » ouvre le formulaire sur place** — voir « Publications ». La nouvelle
  publication arrive en tête du fil, sans changer de page. `/fil?publier` l'ouvre d'emblée
  (c'est la cible du « + Publier » du tableau de bord et de « Publier dans le groupe »
  du menu + Ajouter, y compris depuis le fil lui-même)
- **Ce qui y figure**, à sa création : publications, sessions, prises, setlists,
  playlists — les **nouveautés** — et les **commentaires**, de toutes les cibles (prise,
  setlist, publication)
- **Trois vues**, en tête de page : **Tout** (par défaut), **Nouveautés**, **Commentaires**
  (`?vue=nouveautes`, `?vue=commentaires`). Dans l'URL : la vue est rendue par le serveur,
  se partage, et « Tous → » de la vue Commentaires du tableau de bord y mène. Basculer ne
  fait ni défiler ni empiler l'historique. Une vue inconnue retombe sur Tout
- **Strictement chronologique.** Un commentaire ne fait pas remonter sa cible : il est son
  propre élément, daté de son écriture. Un fil qui se réordonne se relit mal dans un petit
  groupe
- **Les commentaires sont regroupés**, comme les prises : ceux d'un même jour sur une même
  cible forment une carte (« Marc et Julie ont commenté », « sur Sunny — prise 3 · … »).
  Une discussion de dix réponses est une nouvelle, pas dix. La carte cite les 5 derniers
  dans l'ordre de la discussion, chacun menant à lui-même (`#comment-<id>`, au repère
  `?t=` s'il en a un), puis « Répondre → » (`#commenter`). Une **citation**, pas la
  discussion : ni pouces ni saisie sur la carte, on réagit là où elle vit, avec le lecteur
  pour les repères. Ceux d'une publication ou d'une setlist se lisent aussi sous leur carte
  quand elle est dans la page — la vue Nouveautés évite ce doublon
- **Les prises sont regroupées** : celles qu'un même membre dépose le même jour dans une
  même session forment une seule carte (« Marc a ajouté 6 prises »). Une répétition
  découpée en douze prises est une nouvelle, pas douze. La carte en montre 5 et renvoie
  à la session pour la suite ; chaque prise s'écoute dans la barre du bas
- **Une publication** se montre en entier : message, lecteur, vignette YouTube (iframe au
  clic seulement), suggestion avec « Ajouter au référentiel », pouces, commentaires
- **Lecteur natif** (`<audio preload="none">`) pour un enregistrement perso publié, pas de
  waveform : un fil peut en porter dix, et rien n'est téléchargé avant qu'on lance la
  lecture. La page de la publication garde la waveform et l'ancrage des commentaires
- **Un seul lecteur à la fois** : lancer un enregistrement du fil coupe les autres et la
  barre du bas ; lancer une prise dans la barre du bas coupe le fil
- **Commentaires sur place** sous les publications et les setlists : les 2 derniers, les
  précédents se déplient sur la carte, et la zone de saisie suit (`CommentsPanel` en mode
  `inline` : ni titre ni tri, pas d'ancrage — il n'y a pas de lecteur à suivre). Tout est
  chargé avec la page : une discussion est bornée par la taille du groupe
- **« Charger plus »**, par pages de 20. Pagination **par curseur** (horodatage + clé de
  l'élément), pas par `offset` : le fil bouge pendant qu'on le lit, et un décalage ferait
  sauter ou doubler des cartes. Une seule requête (`UNION ALL`, `src/lib/server/feed.ts`)
  ordonne toutes les sources, pour qu'un type très actif ne cache jamais les autres
- Le curseur garde la précision de Postgres (microsecondes), repassé en texte : un `Date`
  JavaScript la perdrait et le curseur ne retrouverait plus sa ligne
- Une carte qui a changé de page entre deux chargements (prise ajoutée à une série du
  jour) n'est pas affichée deux fois
- Lié au groupe pour lequel il a été rendu : si un autre onglet a changé de groupe,
  « Charger plus » reçoit `409` et la page se recharge sur le nouveau groupe

## Référentiel de morceaux (`/songs`)

- Géré par tout membre du groupe actif (pas réservé aux admins) — scope toujours par `current_group_id`
- Ajout : titre (unique dans le groupe), tonalité, statut, année, durée de référence,
  tempo en BPM (le clic de la feuille de répétition)
- **Composition du groupe ou reprise**, choisi en tête du formulaire (`SongFields.svelte`) :
  c'est ce qui dit quoi écrire où. Pas de colonne en base — une reprise est un morceau qui
  a un artiste original (`original_artist`) :
  - **Composition du groupe** : « Écrit par » (`composer`), facultatif — les membres qui
    l'ont écrit, vide pour tout le groupe. Ni le nom du groupe ni un « artiste » à saisir :
    le groupe est implicite. L'année est celle de la composition
  - **Reprise** : « Artiste ou groupe original » obligatoire (`400` sinon), « Compositeur »
    facultatif quand il diffère de l'interprète, année de sortie, et la recherche Deezer,
    qui n'est proposée qu'ici
  - Passer de l'un à l'autre ne perd pas la saisie ; enregistrée en composition, la fiche
    n'a jamais d'artiste original (`parseSongForm`, `src/lib/server/songs.ts`)
  - L'en-tête d'un morceau le crédite comme un album (`songCredit`, `src/lib/songs.ts`) :
    le **nom du groupe d'abord**, en interprète — reprise ou non, c'est lui qui le joue —,
    puis l'origine : « The Lambda · écrit par Julie », « The Lambda · reprise de Stevie
    Wonder (1972) »
- Modification possible après coup, dans le tableau (mode édition) ou depuis la page du
  morceau — voir « Vue morceau »
- Statut `abandonne` → masqué dans le sélecteur d'upload, prises existantes conservées ; reste visible et modifiable dans `/songs`. Les propositions de travail restent disponibles.
- Suppression bloquée si des prises existent pour ce morceau
- Liste affiche tous les statuts du groupe actif, avec nombre de prises (`take_count`)
- **Deux modes**, comme une playlist. Par défaut la liste **se lit** : en-tête de page
  commun (visuel fixe `IconCover.svelte`, une note sur fond orange, comme pour une
  playlist ; nombre de morceaux, au répertoire, prises), puis une ligne par morceau (`SongListRow.svelte`) — pochette, titre,
  compositeur / reprise / année, statut, tonalité, nombre de prises. Toute la ligne mène au
  morceau. « Modifier » passe au **tableau** (mode édition) : colonnes triables, édition
  sur place, suppression. « Ajouter » ouvre la création dans les deux modes
- **Tri**, dans la barre de filtres des deux modes : titre, année de composition (ou de
  sortie pour une reprise), nombre de prises, statut. Chaque critère part dans son sens le
  plus parlant (A → Z, du plus ancien au plus récent, le plus de prises d'abord), et la
  flèche voisine l'inverse ; son infobulle dit le sens dans les mots du critère. Un
  morceau sans année reste en fin de liste dans les deux sens. Le sélecteur reste en mode
  édition : le tableau n'a pas de colonne pour l'année
- Filtre « À nommer » et étiquette sur les morceaux créés à la volée sous un titre
  provisoire — voir « Morceau absent du référentiel »
- Chaque ligne porte **« Setlist »**, dans les deux modes — au survol à la souris en
  lecture, avant « Modifier » et « Supprimer » dans le tableau : on parcourt le
  référentiel pour bâtir un programme bien plus souvent que pour corriger une fiche, et la
  destruction reste en dernier. Même sélecteur qu'en vue morceau
  (`AddToSetlistButton.svelte`), et rien ne s'affiche sur un morceau `abandonne`

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
- `?date=YYYY-MM-DD` ouvre le mois de ce jour avec son panneau déplié et amené à l'écran
  (liens du tableau de bord) ; il l'emporte sur `?month=`
- Badges colorés : rouge = indisponible, orange = répétition, vert = concert, violet = studio, gris = autre
  (mêmes teintes que le visuel d'une session, `SessionCover.svelte`)
- Droits : seul l'auteur peut modifier ou supprimer son indisponibilité ; les événements de groupe sont modifiables/supprimables par les membres du groupe actif
- L'événement d'une session ne se supprime pas depuis l'agenda (`409`) : c'est par lui que
  la session y figure. Il part avec la session, qui porte la suppression
- `author` = nom de l'utilisateur connecté

## Groupe actif (`/group`)

- Consultation pour tout membre : informations du groupe, compteurs (dont le nombre exact de
  prises, vidéos seules signalées, et l'espace disque de leurs pistes audio), logo, liens vers les
  réseaux du groupe (ouverts dans un nouvel onglet), liste des membres avec leur photo, leurs
  instruments dans ce groupe et leur rôle (voir « Profil d'un membre »),
  lieux du groupe (voir « Lieux et adresses »)
- Le rôle **global** d'un membre (`users.role`) n'est affiché qu'aux admins globaux, et n'est
  pas sélectionné en base sinon — le masquer côté client le laisserait dans le payload
- Un **admin de groupe** (`user_groups.role = 'admin'`) y gère son groupe sans passer par `/admin` :
  renommer le groupe, ajouter un membre, retirer un membre, changer le logo et les liens réseaux,
  gérer les lieux
- Ajout **par pseudo exact**, pas par liste déroulante : un admin de groupe n'a pas à voir
  l'annuaire des comptes des autres groupes de la plateforme
- Un membre ajouté depuis `/group` l'est toujours en rôle `member`
- Le sélecteur de rôle dans le groupe n'apparaît qu'au superadmin. Un admin de groupe ne peut
  ni promouvoir un membre, ni retirer un autre admin de groupe (ce qui l'empêche aussi de se
  retirer lui-même)
- Le dernier membre d'un groupe ne peut pas être retiré : le contenu deviendrait inatteignable

## Profil d'un membre (`/profile`)

Un membre n'était qu'un nom et ses initiales. Il peut se montrer, et dire ce qu'il joue.

- **Photo de profil**, déposée par le membre lui-même : choisir un fichier suffit, il part
  aussitôt. « Retirer » sans confirmation : les initiales reviennent, et la photo se
  redépose. PNG, JPEG, WebP ou GIF, **8 Mo** au plus, format lu dans les octets, SVG refusé
- **Recadrée en carré au centre** et réencodée par ffmpeg en deux JPEG : 256 px (profil),
  96 px (partout ailleurs). L'original n'est pas gardé, ni ses métadonnées (EXIF, position GPS)
- En base (`user_avatars`, migration 046), comme une pochette : elle suit le compte dans
  `pg_dump` et part avec lui. Elle n'entre pas dans l'archive JSON d'un groupe
- **Visible** du membre, des membres d'un de ses groupes et des admins globaux — pas
  publique, et pas limitée au groupe actif : un compte appartient à plusieurs groupes.
  Servie par `GET /api/users/[id]/avatar` (`?size=thumb`, `?v=` pour un cache long) ; un
  compte hors de portée répond `404`, comme une photo absente (`src/lib/server/avatars.ts`)
- **Où elle paraît** (`Avatar.svelte`) : barre du haut, barre latérale, profil, membres de
  `/group`, cartes du fil, commentaires. Sans photo, ou si l'image ne charge pas, les
  initiales. Les participants d'une session restent du texte : pas de photo
- **Instruments, par groupe** (`user_groups.instruments`, migration 046) : on tient la basse
  dans l'un et on chante dans l'autre. Section « Mes groupes » du profil, un groupe à la
  fois, en vignettes (`InstrumentsInput.svelte`) : une liste usuelle proposée sans être
  imposée, saisie libre. **8 au plus**, 40 caractères chacun ; doublons écartés sans casse,
  l'orthographe de la liste reprise (« batterie » → « Batterie ») — `normalizeInstruments`,
  `src/lib/instruments.ts`, partagé par l'écran et le serveur
- **Le membre seul** écrit ses instruments (`setMemberInstruments`, `src/lib/server/groups.ts`,
  l'identifiant venant de la session) ; ni l'admin du groupe, ni un admin global. Ils se
  lisent sous son nom dans les membres de `/group`, où un membre qui n'a rien dit se voit
  proposer de le faire. Ils partent avec l'appartenance, et entrent dans l'archive JSON
- Pas de notification : un profil n'annonce pas de contenu
- « Mes groupes » porte aussi, groupe par groupe, les **préférences de notification** —
  voir « Notifications d'activité »

## Page d'un membre (`/members/[id]`)

Qui est qui, et qui a fait quoi, dans le groupe actif.

- **En-tête** : photo, nom affiché, `@pseudo` (celui des mentions), rôle dans le groupe,
  ancienneté dans le groupe, instruments, et les chiffres non nuls — prises déposées,
  commentaires, sessions créées, publications. « Modifier mon profil » sur la sienne
- **Ce qu'il a fait dans le groupe actif**, le plus récent d'abord : ses 8 dernières
  prises déposées (écoutables dans la barre du bas), ses 8 derniers commentaires (chacun
  mène à lui-même, au repère de la prise), ses publications, ses indisponibilités à venir
  (déjà visibles dans l'agenda). Rien de ses autres groupes, rien de son espace perso hors
  de ce qu'il a publié (`src/lib/server/members.ts`)
- **Pas de présence aux sessions** : les participants d'une session sont du texte libre
  (`sessions.members`), pas des comptes, et un rapprochement par nom se tromperait dès
  qu'un membre change de nom affiché ou qu'un participant est tapé autrement
- **Membres du groupe actif seulement** : un compte qui n'en est pas répond `404`. Un lien
  vers un membre qui partage un **autre** de ses groupes bascule vers le premier groupe
  commun (`retargetActiveGroupToMember`, `src/lib/server/group-scope.ts`), comme tout
  permalien. Changer de groupe depuis la page ramène à `/group`
- **On y arrive** par les noms : membres de `/group`, auteur d'une carte du fil (pas d'une
  carte de commentaires à plusieurs voix), auteur d'un commentaire. Un ancien membre n'a
  pas de lien — le serveur dit pour chaque commentaire si son auteur est encore membre du
  groupe de la discussion (`author_is_member`, `commentsWithReactions`)

## Logo et réseaux du groupe (`/group`)

- **Logo** : PNG, JPEG, WebP ou GIF, 2 Mo maximum, stocké en base (`group_logos`) pour suivre
  le groupe dans `pg_dump` et partir avec lui. Le format est lu dans les octets du fichier,
  jamais repris du navigateur ; SVG refusé (servi depuis notre origine, il pourrait exécuter du script)
- Servi par `GET /api/groups/[id]/logo`, **publiquement**, sans compte : en attendant des
  pages publiques de groupe, c'est l'image d'aperçu d'un lien d'écoute collé dans une
  messagerie, dont le robot n'est pas connecté. Un logo est une vitrine ; rien d'autre du
  groupe ne s'ouvre ainsi. L'URL porte `?v=<horodatage>` pour un cache long (`public`,
  `immutable`) sans jamais servir un ancien logo
- **Miniature** (`?size=thumb`) : JPEG carré de 512 px sur fond blanc, ~25 Ko, fabriqué par
  ffmpeg à la première demande puis gardé en base (`group_logos.thumbnail`, migration 034),
  remis à zéro quand le logo change. Un logo peut peser 2 Mo, et WhatsApp ignore les images
  d'aperçu trop lourdes. Un logo que ffmpeg ne sait pas réduire renvoie vers l'image par défaut
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
    SHA-256). Une prise au son amélioré y figure deux fois : `kind: 'audio'` (`{id}.mp3`, la
    version écoutée) et `kind: 'original'` (`{id}.original.mp3`). Ne contient **jamais** de
    hash de mot de passe. Superadmin uniquement
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
  `playlists` → `setlists` → `posts` → `calendar_events` → `sessions` (les prises, commentaires, réactions,
  entrées de playlist et photos de bandeau tombent en cascade), et les adresses des lieux
  (`group_places`) avec le groupe → `songs` → `notifications` → `group_logos`
  → `user_groups` → `groups`
- Les fichiers `.mp3` sont supprimés **après** le commit : un fichier orphelin se rattrape,
  une ligne pointant vers un fichier disparu non
- Les **comptes utilisateurs sont conservés** — seule l'appartenance au groupe disparaît.
  Les **espaces perso** aussi : les publications partent, les enregistrements qu'elles
  montraient restent chez leurs auteurs.
  Les indisponibilités personnelles (`group_id IS NULL`) ne sont pas touchées
- Opération irréversible : aucune sauvegarde n'est prise automatiquement

## Notifications d'activité

- Cloche dans la barre du haut, avec pastille du nombre de non lues du **groupe actif**
- Au téléphone, le panneau descend de la barre du haut sur toute la largeur, sa hauteur
  s'arrête au-dessus de la barre d'onglets et la page derrière lui est voilée et figée.
  Toucher le voile ferme le panneau sans activer ce qui est dessous ; même règle pour le
  panneau de « + Ajouter » (`Menu.svelte`)
- Une notification est créée pour **chaque membre du groupe qui la veut, sauf l'auteur de
  l'action**, au moment de l'action (`src/lib/server/notifications.ts` → `notifyGroup`)
- **Préférences, par groupe** (`user_groups.notification_prefs`, migration 047), réglées
  dans « Mes groupes » du profil ; la roue dentée de la cloche y mène
  (`/profile#notifications-<id>`, le réglage s'ouvre d'emblée) :
  - **Commentaires** : « Tous » (par défaut), « Ce qui me concerne » — sur ce qu'on a déposé
    ou créé (prise, setlist, publication) et dans les discussions où l'on a déjà écrit —, ou
    « Aucun ». C'est le seul type à trois niveaux : tout le groupe commente tout, et c'est
    ce qui fait le plus de bruit
  - Un interrupteur pour chacun des autres : prises, sessions, playlists, setlists,
    publications, agenda. Tous activés par défaut
  - **Les mentions ne se règlent pas** : qui écrit `@pseudo` s'attend à être lu, et les
    couper retirerait aux autres le seul moyen sûr d'attirer l'attention
  - Par groupe plutôt que pour le compte : on suit de près le groupe où l'on joue chaque
    semaine, et de plus loin un autre. Objet vide en base = tout, comme avant : une clé
    absente vaut sa valeur par défaut (`src/lib/notification-prefs.ts`)
  - Le filtre est **dans le fan-out** (`wantedBy`) : rien à changer chez les appelants. Le
    fil d'actualité, lui, montre toujours tout
  - Ne vaut que pour la suite : les notifications déjà écrites restent
- Sept déclencheurs, un par création : prise uploadée (`recording`), commentaire (`comment`),
  session (`session`), playlist (`playlist`), setlist (`setlist`), publication (`post`),
  événement d'agenda (`agenda`, indisponibilité comprise). Une session crée déjà sa notification : l'événement
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
  Ouvrir une notification la marque lue puis navigue vers la page concernée. Une
  notification de commentaire mène au commentaire lui-même (`#comment-<id>`), mis en
  évidence. Pas de temps réel : une page ouverte ne voit pas arriver les commentaires des
  autres, mais ouvrir la notification **recharge ses données** même si l'on y est déjà
  (`invalidateAll`), sans couper la lecture ni la saisie en cours. En pied de
  menu, « Tout le fil d'actualité » mène à `/fil` : on ouvre la cloche pour savoir « quoi de
  neuf », et le fil en est la réponse complète
- Le nom de l'auteur est relu depuis `users` (`actor_name` n'est qu'un repli) : un changement
  de nom affiché se répercute sur l'historique, comme pour les commentaires
- Une notification disparaît avec le contenu qu'elle annonce (`session_id`, `recording_id`,
  `playlist_id`, `setlist_id`, `post_id` en `ON DELETE CASCADE`) plutôt que de pointer vers une page supprimée
- La pastille est comptée côté serveur dans `+layout.server.ts` — juste dès le premier rendu —
  puis rafraîchie par le menu toutes les 60 s tant qu'il reste fermé
- Le menu est lié au groupe pour lequel il a été rendu : recréé à chaque bascule, et si un
  autre onglet a changé de groupe (cookie commun), l'API répond `409` et l'onglet se resynchronise
- Aucune purge : la table grandit indéfiniment, à traiter quand le volume le justifiera

## Tableau de bord (`/`)

Il répond à ce qui attend le membre, pas à ce qui s'est passé — c'est le rôle du fil et de
la cloche. Dans l'ordre où on ouvre l'application : réécouter la dernière répétition, voir
la prochaine date, puis seulement l'activité.

- En-tête : le salut seul. Créer une session ou publier passe par « + Ajouter » de la
  navigation (voir « Navigation ») ; des boutons ici ne feraient que le répéter. Plus de
  compteurs (sessions, prises, playlists) : un total n'appelle aucune action
- **« À réécouter »**, en tête : la dernière session passée ou du jour qui a au moins une
  piste audio. Son feuillet (`SessionCover`), son type et son ancienneté (« Hier »,
  « Il y a 5 jours »), son titre, morceaux, prises et durée, et le **▶ rond qui enchaîne
  toute la session** dans le mini-lecteur (`PlayAllButton`), dans l'ordre de sa page. Puis
  ses morceaux — 6 au plus, « et N autres » au-delà — avec le nombre de prises et de
  commentaires ; chacun mène à sa section dans la session (`#song-<id>`). Une session sans
  prise ou vidéo seule n'a rien à jouer : c'est la précédente qui s'affiche
- **« À venir »** : la **prochaine date** en carte, teintée comme son type — le temps qui
  reste (« Dans 3 jours »), le titre, la date, le lieu, et **les absents ce jour-là** :
  une indisponibilité compte sur la carte de la répétition qu'elle touche, pas sur une
  ligne à part. Un événement d'agenda sans session est en pointillé, avec « Créer la
  session → ». Les deux dates suivantes en lignes, avec le nombre d'absents. Les autres
  indisponibilités à venir restent en une ligne. La session affichée dans « À réécouter »
  n'y figure pas, même datée du jour. Toujours affichée, même vide (« Rien de prévu », avec
  « Ajouter une date », qui ouvre l'agenda sur le jour même, formulaire déplié — « Agenda → »
  mène déjà au calendrier). Une date mène à sa session, ou à `/agenda?date=…`
- **« À toi »**, seulement s'il y a quelque chose : un enregistrement resté dans la copie
  de secours de ce navigateur (→ `/record`), des découpes en attente (→ `/upload`, ou
  `/perso` sans groupe actif), des morceaux « À nommer » (→ `/songs?filtre=a_nommer`). Pas
  les mentions : la cloche les signale déjà, et les marque lues à l'ouverture
- **« Activité récente »**, en deux vues, « Tout le fil → » à côté du titre (« Tous → »
  vers `/fil?vue=commentaires` dans la vue Commentaires) :
  - **Nouveautés** (par défaut) : les **3** dernières entrées. Sessions créées, prises
    ajoutées (regroupées par membre, session et jour, comme dans `/fil`), playlists créées
    ou modifiées, setlists créées, publications, triés par horodatage de création, de
    dépôt ou de modification — pas par date prévue. Pas de filtre par type : trois lignes
    n'en demandent pas, le fil montre le reste
  - **Commentaires** : les **5** derniers, seuls. Ils n'entrent pas dans les nouveautés :
    mêlés au reste, ils en sortaient dès qu'une répétition était déposée — et ni le fil
    ni la cloche (qui les marque lus) ne servent à rattraper la discussion
  - Deux vues à la même place plutôt qu'une section de plus : la page ne s'allonge que
    pour qui la demande. Le choix est gardé dans ce navigateur
- Un commentaire y mène là où il a été écrit — la prise, la setlist ou la publication —,
  **sur le commentaire lui-même** (`#comment-<id>`), au repère de la prise s'il en a un
  (`?t=`). La requête part de `comments` et rejoint les trois cibles — c'est la cible qui
  dit à quel groupe il appartient
- **« En préparation »** : les 3 dernières setlists créées et les 3 dernières playlists
  modifiées, avec leur nombre de morceaux ou de prises
- Sur ordinateur, « À réécouter » et « À venir » à gauche ; « À toi », l'activité et
  « En préparation » dans la colonne de droite. Sur une colonne (≤ 700 px), dans cet ordre
- Actualisation toutes les 60 secondes tant que l'onglet est visible, et dès qu'on y revient

## Pages légales (`/mentions-legales`, `/confidentialite`)

- **Publiques** (`PUBLIC_PATHS`, `src/routes/+layout.server.ts`) : la LCEN exige des mentions
  « directement et facilement accessibles », y compris à qui n'a pas de compte
- Liées depuis l'accueil public, `/login`, le bas de la barre latérale et la page « Plus »
  (`LegalLinks.svelte`)
- Éditeur, hébergeur et contact vivent dans `src/lib/legal.ts`, seul endroit à modifier.
  Un champ encore inconnu vaut `TO_COMPLETE` et s'affiche tel quel plutôt que d'être inventé
- La politique de confidentialité décrit ce que fait **réellement** l'application : toute
  nouvelle donnée collectée, tout nouveau cookie ou service tiers (comme les vidéos YouTube)
  doit y être reporté
- Pas de bandeau cookies : seuls des cookies strictement nécessaires sont posés
  (`band_session`, `band_group`, `band_group_switched`)
