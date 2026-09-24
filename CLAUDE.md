# CLAUDE.md — Arène PvPvE navigateur (nom de code à définir)

Ce fichier donne le contexte du projet. Lis-le en entier avant de proposer quoi que ce soit.

> **Commence par lire [`ETAT.md`](ETAT.md).** Ce fichier-ci dit ce qu'on veut
> faire et ne bouge presque pas ; `ETAT.md` dit où on en est, ce qui a été décidé
> en cours de route, ce qui reste ouvert et les pièges déjà rencontrés. Tiens-le à
> jour quand tu termines un morceau.

---

## 1. Le projet en une phrase

Un jeu d'arène multijoueur 3D **dans le navigateur**, inspiré de Dark and Darker mais compressé au format `.io` : sessions de 5 minutes, connexion instantanée, on commence nu, on monte en puissance en tuant, on perd tout à la mort.

**Ce n'est pas un extraction game.** L'extraction a été volontairement retirée : incompatible avec une session de 5 minutes dans un navigateur, où l'interruption est permanente. C'est un deathmatch d'arène persistante.

**Ce n'est pas un jeu sérieux.** La piste serious game a été explorée puis abandonnée. Ne pas la remettre sur la table.

### Le principe directeur

> **Ce qui monte, c'est le prix de votre tête, pas votre force.**

C'est une **course à la visibilité**, pas une course à l'armement. Rien ne s'accumule en puissance ; ce qui s'accumule, c'est l'attention des autres joueurs. Un joueur monte, devient l'événement de la partie, tombe, et son équipement redistribue le pouvoir à ceux qui l'ont abattu. Nouveau cycle.

Conséquence clé : **un joueur qui arrive en retard n'est jamais condamné.** Il est simplement invisible, ce qui est un avantage. Il peut viser le leader dès sa première minute.

---

## 2. Design validé — NE PAS REMETTRE EN CAUSE

### Format et accès
- Jeu navigateur. Sessions courtes : le joueur se connecte pour ~5 minutes.
- **Serveur continu**, entrée et sortie libres à tout moment. Pas de lobby, pas d'attente, pas d'amorçage à vide.
- Cycles de classement de 10–15 minutes plutôt que des parties fermées. Personne n'est éjecté à la bascule, le tableau se remet à zéro.

### Boucle de base
- On commence **nu**, on frappe aux poings.
- PvPvE : squelettes, démons, monstres humanoïdes.
- Barils et coffres contenant du butin.
- Tuer joueurs et monstres donne de l'XP.
- À la mort : **retour niveau 1, sans équipement.** Remise à zéro.

### Progression
- **Le niveau est un score, pas une statistique.** Effet mécanique nul ou quasi nul (100 → 140 PV maximum sur toute la courbe, à confirmer).
- **Aucun bonus de dégâts. Aucun bonus de PV.** Verrouillé définitivement.
- Toute la puissance passe par **l'équipement ramassé**, donc par ce qui se perd.
- Le classement porte sur la **série en cours**, jamais sur un cumul. C'est ce qui garde le sommet accessible : une série tombe, la place se libère.

> Rationale : le scaling en PV pur rend la coalition mathématiquement impossible. Trois joueurs ont un DPS fixe ; face à 10× les PV, ils ne passent pas. Le leader devient un mur au lieu d'une cible.

### Paliers de série
Trois paliers atteignables en session courte : **3 / 5 / 8 kills.**

| Palier | Effet |
|---|---|
| 3 — Marqué | Aura légère. Révélé sur la carte 3 s toutes les 15 s. |
| 5 — Traqueur | Révélé en permanence, position visible de tous, pas amplifiés. |
| 8 — Guerrier Ultime | Apparence spectaculaire, halo, son distinct. Prime massive. |

- **Récompense essentiellement cosmétique et statutaire.** Le prestige est la récompense ; la prime est la sanction.
- **Exclu :** mobilité, récupération, survie, dash, régénération — tout ce qui rend le leader plus dur à tuer. (Écarté explicitement en discussion : c'est du PV déguisé.)
- Seule exception encore ouverte : une majoration de la prime que le leader touche sur **ses propres** kills — un bonus qui accélère la boucle au lieu de la protéger.

### Prime et coalition
- Prime **partagée entre tous ceux qui ont infligé des dégâts dans les 10 dernières secondes**, avec bonus au coup fatal.
  - Sans ça, personne ne coopère : chacun attend que les autres s'usent.
- La prime croît **beaucoup plus vite** que la puissance. Le leader vaut plusieurs fois un joueur ordinaire (ordre de grandeur : +30 % d'efficacité contre 300 % de valeur).
- L'équipement du leader **tombe au sol à sa mort** et équipe ses tueurs.

### Anti-farm et anti-spawn kill
- **Sas d'entrée** : on n'apparaît jamais dans l'arène, mais dans une petite salle fermée avec plusieurs sorties randomisées. Le joueur décide quand il sort. Aucun point de spawn campable — le spawn kill est rendu structurellement impossible, pas atténué par un timer.
- **L'XP gagné en tuant dépend de ce que portait la victime et de sa série.** Un joueur nu ne rapporte rien. Le farm de débutants est sans intérêt, sans avoir besoin d'une règle explicite.
- **Gradient spatial** (remplace les étages de Dark and Darker) : périphérie = monstres faibles, butin basique, peu de joueurs. Centre = démons, coffres, meilleures récompenses. Le nouvel arrivant apparaît en périphérie et choisit de s'enfoncer.
- **TTK court et stable : 2–4 secondes**, identique à tous les paliers. C'est ce qui garantit que trois joueurs battent toujours un joueur.

### Armes
- **Uniquement des armes de corps à corps.** Pas d'arme à distance : pas de frustration pour qui ne veut jouer qu'au contact.
- Poings, épée et longue hache pour commencer.

---

## 3. Questions ouvertes — À TRANCHER

### Priorité 1 — Le système de combat à l'épée
**Le risque le plus élevé du projet. Rien n'est tranché.**

Proposition initiale : pierre-papier-ciseaux. Trois objections non résolues :
1. **Trop de hasard** — 33 % sur peu d'échanges, un duel devient un tirage au sort.
2. **La latence** — la lecture exige une fenêtre de télégraphe d'au moins 300 ms ; à 80 ms de ping navigateur elle fond.
3. **Inadapté au N joueurs** — le RPS est une mécanique de duel. En arène ouverte, le combat à trois est la norme. Défaut rédhibitoire.

Deux pistes alternatives qui gardent l'intention :
- **Attaques et gardes directionnelles** (haut / gauche / droite). Du RPS spatialisé, donc lisible à l'animation, et survit au multi-joueur.
- **Attaque / parade / esquive avec endurance.** Chaque action coûte et a une fenêtre de récupération. Tolère la latence, marche à N joueurs.

### Priorité 2 — La visibilité du palier
Probablement **la variable la plus importante du jeu**, plus que le contenu des paliers.
- Aura visible de loin → on renonce à attaquer seul → la coalition se forme.
- Aura visible seulement au contact → on meurt par surprise → la coalition n'émerge jamais.

À déterminer : distance de perception, et si elle est la même pour tous.

### Priorité 3 — Réinitialisation de la série
Remise à zéro sèche à la mort, ou partielle ? Le sec est brutal mais lisible et garantit le renouvellement. Le partiel adoucit la frustration mais risque de figer le haut du tableau.

### À trancher ensuite
- **Bonus de prime du leader** : retenu ou tout-cosmétique ?
- **Écart nu ↔ pleinement équipé** : ordre de grandeur visé 2,5–3× maximum, pour que trois joueurs coordonnés l'emportent toujours.
- **Bascule de cycle** : les séries en cours survivent-elles au changement de cycle ?
- **Rôle du PvE** : source d'XP, source de butin, ou obstacle qui ralentit et expose ? Les trois sont possibles mais ne produisent pas le même jeu.
- **Vue 3e personne ou 1re personne ?** → voir §4.

---

## 4. Direction technique

### 3D — décision prise
Le jeu sera en 3D. (La 2D top-down avait été recommandée pour le coût de production ; la 3D est assumée.)

**Vue : 3e personne recommandée** (épaule haute ou trois-quarts). Rationale : la formation des coalitions repose entièrement sur le fait de voir l'aura du leader de loin. En 1re personne, le FOV tombe à ~90°, l'information devient rare, et le jeu devient une succession d'embuscades — c'est Dark and Darker, pas agar.io. **Pas encore formellement tranché.**

### Moteur : PlayCanvas
- Moteur **open source MIT**, avec définitions TypeScript complètes. Installable via npm comme une librairie ordinaire.
- Runtime **1–2 Mo**, le plus léger des moteurs web. Chargement le plus rapide. Rendu WebGPU le plus mature.
- Comparatifs écartés : Unity (builds web ≥ 8 Mo), Godot (~9 Mo gzippés à vide), Babylon.js (bon mais pas d'avantage décisif ici), PixiJS (2D uniquement).
- Contrainte de distribution : **CrazyGames plafonne à 50 Mo de chargement initial, 250 Mo au total.**

**Le prix PlayCanvas ne concerne pas le moteur.** Le moteur est gratuit. Ce qui est payant (à partir de 15 $/mois) est l'**éditeur cloud** : stockage, projets privés, hébergement, collaboration temps réel. Non nécessaire ici.

⚠️ **Fork d'organisation à trancher :**
- **Option A — engine-as-library (recommandée).** PlayCanvas via npm, code-first, dans son propre dépôt git. Workflow développeur classique. Gratuit.
- **Option B — éditeur cloud.** Utile seulement si un non-développeur doit composer les niveaux. Casse le workflow git.

### Stack
| Couche | Choix |
|---|---|
| Client | PlayCanvas (npm) + TypeScript |
| Serveur | Node.js + TypeScript |
| Framework réseau | **Colyseus** (MIT, auto-hébergeable, cloud dès ~15 $/mois) |
| Transport | **WebSockets** (standard 2026). Pas de WebRTC, pas de WebTransport. |
| Tick serveur | 20–30 Hz |
| Persistance | **Aucune.** Tout l'état vit en mémoire dans la room. |

### Architecture : serveur autoritaire
Obligatoire — jeu compétitif, temps réel, butin à valeur. Le client envoie des inputs, le serveur simule et diffuse. **On ne fait jamais confiance au client.**

Toute la logique vit sur le serveur : déplacement, combat, PV, XP, butin, paliers, prime. Le moteur client ne fait que **dessiner et lire les entrées**.

> **L'argument décisif de la stack : le même langage des deux côtés.** En TypeScript, la simulation de combat est écrite **une seule fois** et tourne sur le serveur (autorité) et sur le client (prédiction). Avec Unity ou Godot, il faudrait l'écrire deux fois et traquer les divergences à vie. Pour un développeur seul, c'est la différence entre aboutir et s'enliser.

**Monorepo** : client / serveur / simulation partagée dans le même dépôt. C'est ce qui rend ce partage possible.

### Netcode — dans cet ordre, pas avant
Ne rien construire d'avance. Ajouter chaque brique quand la sensation devient mauvaise.
1. **Prédiction côté client** — le client applique l'input immédiatement.
2. **Réconciliation serveur** — rejeu des inputs en attente à réception de l'état autoritaire.
3. **Interpolation d'entités** — les autres joueurs rendus légèrement dans le passé.
4. **Compensation de latence** — le serveur rembobine à la position de la cible au moment du tir.

Référence : la série de Gabriel Gambetta.

### Ce qui simplifie énormément
**Il n'y a pas de persistance.** Mort = retour niveau 1 sans équipement. Donc : pas de comptes, pas d'inventaire stocké, pas de base de données, pas de migration. Économie estimée : ~2 mois de travail.

---

## 5. Pipeline art

### Style
Très low poly, compensé par des textures — en basse résolution assumée.

- **Blender** pour tout : modélisation, UV, rigging, animation, export **glTF/GLB** (format natif PlayCanvas). Gratuit, et l'animation est le chemin critique — les outils low-poly concurrents (MagicaVoxel, Crocotile, Asset Forge) ne savent pas animer.
- **Palette texture** : une seule image 64×64 ou 128×128 avec une grille de couleurs plates, partagée par tous les modèles. Chaque face mappée sur un pixel. Un seul draw call pour le décor, quelques Ko d'atlas, cohérence chromatique garantie.
- Dessin à la main (sang, rouille, runes) → **Texture Paint dans Blender**. Pas de Substance Painter (cher, lourd, conçu pour du PBR haute def).
- ⚠️ **Filtrage en `nearest`, pas linéaire.** Sinon les textures basse résolution deviennent floues au lieu de rester nettes. C'est ce qui sépare un pixel-art volontaire d'un rendu raté.
- **Unlit ou shading très simple.** Un éclairage PBR sur du low poly annule l'effet et coûte cher.

### Contraintes de lisibilité (imposées par le design)
- **Animations télégraphiées**, silhouettes distinctes. Le combat repose sur la lecture : distinguer attaque / parade / esquive **avant** l'impact. Des poses lisibles et un peu raides valent mieux que du motion capture élégant.
- Reconnaître **l'arme d'un adversaire en une demi-seconde**, à distance.
- **L'aura doit percer les murs** aux paliers hauts (contour ou colonne de lumière en occlusion). Sinon le leader disparaît derrière un pilier et la coalition ne se forme jamais.
- **Carte ouverte** : peu de murs pleins, beaucoup d'obstacles bas, différences de hauteur, colonnes. Couverture tactique sans casser la vision à distance.

### Économie de production
- **Un seul squelette pour tout ce qui est humanoïde** (joueurs, squelettes, démons). Un rig, des maillages différents dessus. Divise le travail d'animation par ~5. **Décision à prendre avant de modéliser quoi que ce soit** — la refaire après coûte très cher.
- **Mixamo** pour le socle d'animations (course, idle, mort). Les animations spécifiques (attaques directionnelles, garde) à la main.
- Animations minimales : idle, course, 3 attaques directionnelles, garde, esquive, touché, mort.

---

## 6. Workflow git

Projet TypeScript ordinaire : `package.json`, source, assets, bundler. Git gère tout.

> ⚠️ **Les commandes git, c'est moi.** Ne lance jamais `git init`, `add`, `commit`,
> `push`, `branch`, `merge`, `lfs install` ni aucune autre commande git — même pour
> initialiser le dépôt, même si je viens de te demander de créer le projet. Écris les
> fichiers, dis-moi ce qu'il reste à committer, et laisse-moi le faire.

- **Git LFS dès le premier commit** pour tous les binaires (`.glb`, textures, sons). Rétroactivement c'est pénible.
- **Un asset binaire appartient à une seule personne à la fois.** Git ne fusionne pas les binaires — c'est une règle d'équipe, pas un problème technique.
- **Les niveaux sont décrits en JSON, pas en fichier de scène binaire.** Positions, types d'objets, points d'apparition, zones du gradient. Diffable, fusionnable, lisible en pull request — et surtout **le serveur Node lit le même JSON**, ce qui garantit que serveur et client partagent exactement la même géométrie.
- Éditeur de niveau maison éventuel : une page web qui charge le JSON, permet de déplacer les objets, réexporte le JSON. 2–3 jours. **À faire seulement quand placer les objets à la main devient réellement pénible.**

---

## 7. Ordre de prototypage — RESPECTER STRICTEMENT

> **Le piège fatal en solo : construire l'arène, les monstres, le butin et les paliers, puis découvrir au moment de brancher le réseau que le combat ne fonctionne pas avec du ping.**

### Semaine 1 — La sensation, en local, avec des capsules
Deux capsules colorées, le système de combat, **aucun réseau, aucune animation, aucun modèle**. Des flashs de couleur pour signaler les états.

Question unique : **est-ce que le combat est agréable ?**
- Si oui avec des capsules → il sera excellent avec des animations.
- S'il n'est agréable *que* grâce à de belles animations → le système est creux.

### Semaines 2–3 — Le même combat en réseau, 1v1, avec 80 ms de latence injectée
**Le vrai test.** Si le système survit, le projet est viable. Sinon, on change de système de combat pendant qu'il coûte encore trois jours.

### Ensuite seulement
Arène à 8, paliers visibles, prime partagée, sas, gradient spatial, PvE.

**Question de l'étape 2 :** est-ce que trois joueurs s'allient spontanément contre le porteur d'aura ? Si la coalition n'émerge pas avec 8 joueurs dans une pièce, aucune couche de contenu ne la fera émerger ensuite.

### Modèles et animations
**Un seul personnage complet d'abord**, toutes animations, intégré et testé en réseau. On découvre à ce moment-là que les animations sont trop lentes ou mal télégraphiées — et on corrige sur un modèle, pas sur huit.

---

## 8. Métriques de validation

| Métrique | Cible | Ce qu'elle mesure |
|---|---|---|
| Durée médiane d'une série au palier 8 | **20–90 s** | > 90 s : leader trop fort ou prime trop faible. < 20 s : le palier ne procure aucune sensation. |
| Taux de mort dans les 10 s après entrée | proche de 0 | Spawn kill résiduel |
| Écart de gain top 10 % ↔ médiane | contenu | Snowball |
| % de joueurs qui fuient le porteur d'aura | élevé | **La métrique qualitative la plus importante.** S'ils fuient, c'est gagné, même à statistiques identiques. La peur fait gratuitement le travail de la puissance. |

---

## 9. Comment m'aider sur ce projet

- **Ne propose pas de bonus de dégâts, de PV, de mobilité ou de régénération aux paliers.** C'est verrouillé et le rationale est en §2.
- **Ne propose pas de réintroduire l'extraction ou une dimension serious game.**
- **Ne propose pas d'autels d'encaissement / mise en banque** — écartés parce qu'ils figeaient le haut du classement. Le classement sur série en cours les remplace.
- **Ne lance aucune commande git** — voir §6. C'est moi qui les fais.
- Quand une décision est ouverte (§3), pose la question plutôt que de choisir à ma place.
- Priorise toujours le combat à l'épée : c'est le chemin critique.
- Rappelle-moi l'ordre de prototypage si je commence à parler d'assets avant que le combat soit validé en réseau.
- Tout ce qui touche à l'équilibrage doit passer le test : **est-ce que ça rend le leader plus dur à tuer ?** Si oui, c'est à rejeter.
