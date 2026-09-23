# Arène PvPvE — prototype

Étape **semaine 1** de l'ordre de prototypage (`CLAUDE.md` §7) : la sensation du
combat, en local, avec des capsules. Pas de réseau, pas d'animation, pas de modèle.

La seule question à laquelle ce dépôt doit répondre : **est-ce que le combat est
agréable ?** Si la réponse est oui avec des capsules, elle sera excellente avec des
animations. Si elle n'est oui que grâce à de belles animations, le système est creux.

---

## Démarrer

```bash
npm install
npm run dev
```

Puis <http://localhost:5173> et un clic dans la fenêtre pour capturer la souris.

| Commande | Effet |
|---|---|
| `npm run dev` | serveur de développement Vite |
| `npm run build` | bundle de production dans `apps/client/dist` |
| `npm run typecheck` | TypeScript strict sur les deux paquets |

## Contrôles

| Touche | Action |
|---|---|
| ZQSD / WASD | se déplacer (relatif caméra) |
| Espace | sauter |
| **D + Espace** / **Q + Espace** | esquiver à droite / à gauche, au sol **ou en l'air**. Direction **purement latérale** : en diagonale, Espace saute. Pendant un coup lourd, pas d'esquive : Espace saute. |
| Clic gauche | frapper. À la hache, recliquer pendant un coup enchaîne le suivant, jusqu'à 3 ; le 3ᵉ projette un peu |
| Clic gauche **maintenu** | coup lourd : projette et étourdit. On peut bouger et sauter pendant, ralenti |
| **Clic droit** | à l'épée : ruée en ligne droite, toujours conclue par un coup lourd (pendant celui-là, pas de saut). À la hache : **tourbillon**, un tour par clic ou tant qu'on maintient, 3 d'affilée max, le dernier repousse. Aux poings, rien. |
| Clic gauche **en l'air, à l'épée ou à la hache** | plongeon : suspension, chute verticale, étourdit devant |
| Molette souris / déplacement | viser (caméra 3ᵉ personne épaule droite) |
| `1` / `2` / `3` | poings / épée / longue hache — **debug**, les armes ne se ramassent nulle part |
| `K` | se suicider — **debug**, pour tester la remise à zéro |
| Échap | libérer la souris |

En dev, `window.__arene` expose `{ app, monde, moi, camera, acteurs, entrees, hud }`
depuis la console du navigateur.

---

## Ce qui est implémenté

**Déplacement, calibré sur Quake Live.** Une unité Quake vaut un pouce et le
joueur y fait 72 unités de haut, soit 1,83 m — quasiment notre gabarit, donc les
vitesses se transposent directement. **Pas de sprint** : une seule vitesse, tout
le temps, pour tout le monde.

| | Quake Live | ici | mesuré |
|---|---|---|---|
| Course | 320 ups | 8,13 m/s | **8,13 m/s** |
| Gravité | 800 ups² | 20,3 m/s² | — |
| Friction sol | 6 | 6 | — |
| Saut | 270 ups | **8,1 m/s** (plus haut) | apex 1,55 m, 0,77 s en l'air |

Deux écarts assumés. Le saut est plus haut que les 270 ups d'origine, pour que le
temps de vol laisse la place à une esquive aérienne. Et surtout **le contrôle aérien
est total** — accélération en l'air identique au sol, 81 contre les ~8 de Quake.
Chez Quake elle est basse parce que le strafe-jumping compense ; sans lui, inverser
8,13 m/s demandait 0,8 s, soit plus que le temps de vol : le demi-tour en l'air
était littéralement impossible. À 81 il prend 0,10 s.

**Plafond dur sur la vitesse réelle.** L'accélération de Quake ne borne que la
*projection* de la vitesse sur l'intention, pas sa norme — c'est précisément ce
qui y rend le strafe-jump possible. Dès qu'une contrainte retire une composante de
la vitesse à chaque tick, la composante restante s'accumule : longer le mur de
l'arène montait à **10,2 m/s** au lieu de 8,13, et comme l'arène est circulaire il
suffisait de suivre le bord. Une vitesse unique pour tout le monde, partout : on
plafonne la norme après l'accélération. Ce même plafond termine l'esquive.

**Compteur de vitesse** sous le réticule, avec maintien du pic pendant 2,5 s. Il
mesure la vitesse **sur les déplacements réels**, pas sur le vecteur vitesse : la
séparation entre capsules repousse les positions sans toucher à la vitesse, donc
une poussée n'apparaîtrait pas autrement. Il passe en ambre au-dessus de la vitesse
de course, ce qui est le seul cas qui mérite un coup d'œil.

**Latence de rendu : 9,7 ms** (mesuré, 7,9 cm à pleine vitesse). Une seule étape de
lissage, à une constante de temps d'un tick. Deux étapes cumulées — acteurs *et*
caméra — donnaient 74 ms, ressentis comme un temps mort au démarrage et au
changement de sens. Le sol est plat : il n'y a aucune marche à absorber, la caméra
suit exactement.

**Esquive latérale** — `D + Espace` ou `Q + Espace`, **au sol comme en l'air**.
16 m/s pendant 0,22 s, soit **3,73 m mesurés** : juste au-delà des 3,2 m de portée
de l'épée. Une esquive vous sort de portée, exactement une.

La jauge remplace la recharge : chaque esquive en consomme la moitié, donc **deux
d'affilée**, puis il faut attendre — 1,4 s par demi-jauge, 2,8 s pour le plein.
C'est l'endurance de §3 sous sa forme la plus simple.

> **Aucune invulnérabilité pendant l'esquive.** Des i-frames rendraient le porteur
> d'aura plus dur à tuer alors qu'il est précisément celui qu'on focalise — c'est
> ce que §2 rejette. L'esquive déplace, elle ne protège pas.

À la fin de la fenêtre d'esquive, la vitesse horizontale est ramenée à la vitesse
de course. Au sol la friction le ferait de toute façon en 0,1 s ; en l'air non, et
une esquive aérienne deviendrait un vol plané de dix mètres. L'esquive doit rester
une réponse, pas un moyen de transport.

**Combat, style Minecraft** (décision prise : coups simples, pas de garde)
- **Jauge sous le réticule** : elle se remplit pendant l'animation du coup en
  cours et passe en doré à sa fin, quand on peut refrapper. Aucun coup ne part
  avant : la sanction du spam, c'est la durée du coup lui-même — 0,45 s aux
  poings, 0,6 s à l'épée, 1 s pour le coup lourd, la récupération pour le
  plongeon. Plus de courbe de dégâts façon Minecraft : chaque coup porte ses
  dégâts pleins.
- **Un swing visible = un coup réel**, toujours. L'animation ne peut jamais être
  relancée en cours de route.
- **Attaquer engage.** L'attaquant tombe à 3,66 m/s pendant son swing, et
  encaisser ralentit aussi, 0,35 s. **Une esquive annule le ralentissement.**
  C'est ce qui donne de l'inertie au corps à corps sans ajouter la moindre
  résistance aux dégâts.

**Aucune attaque n'est instantanée** (Plasma Sword de S4 League). Entre la
décision et l'impact il y a un délai — 0,2 s pour un coup normal, 0,45 s pour un
coup lourd — pendant lequel l'animation s'arme et **l'attaque est interruptible**.
Comme dans Street Fighter, le coup fort part bien plus tard que le coup moyen :
un coup normal lancé pendant l'armement d'un coup lourd arrive avant lui.

> **Encaisser un coup annule le sien.** C'est ce qui remplace le recul sur un
> coup normal : interrompre vaut mieux que déplacer, et ça ne casse ni les
> distances ni la lisibilité du combat. Vérifié sur les deux types de coups —
> attaque en vol annulée, cible intacte.

Le pari de §3 tient : ce n'est pas une fenêtre de *lecture*. Personne n'a à lire
l'animation adverse pour choisir une réponse. C'est l'attaquant qui s'expose, et
l'annulation est un effet, pas une décision.

**Clic bref ou maintien.** Rien ne part à l'appui : c'est la durée du maintien
qui tranche, à 0,18 s. Relâché avant, c'est un coup normal ; toujours enfoncé,
c'est un coup lourd. Il n'y a **pas de barre à remplir**, et surtout un coup
lourd n'est jamais précédé d'un coup normal. **Un maintien ne donne qu'un seul
coup lourd** : pour en relancer un, il faut relâcher.

**Coup lourd** — 30 dégâts, impact **0,65 s après l'appui**. Il **projette** : la
cible décolle à **1,15 m** et part **6,1 m** en arrière (mesuré ; 2,2 m à plat
avant). Elle reste étourdie pendant tout le vol plus 0,1 s (0,79 s) — sans ça, le
contrôle aérien total lui rendait la main en plein vol et elle annulait sa propre
projection. La sortie par esquive reste possible après 0,3 s, en l'air. La vitesse
est imposée, pas ajoutée : une cible qui fonce sur l'attaquant part aussi loin
qu'une cible immobile.

**Aucun cooldown, ni sur le coup lourd ni sur la ruée.** Ce qui les limite :

- Le coup lourd dure **1 s**. On peut **bouger et sauter** pendant tout ce temps,
  mais **ralenti** à 3,66 m/s, **sans esquive** (elle laverait le ralentissement ;
  Espace + Q/D y saute donc au lieu d'esquiver), **sans ruée** et sans autre coup. Son vrai coût reste son armement : 0,45 s
  pendant lesquelles n'importe quel coup adverse l'annule.
- La ruée se conclut **toujours** par un coup lourd, qu'elle touche ou non, et
  pendant celui-là **on ne peut pas sauter**. Ce n'est pas décoratif : 7 m en
  0,39 s font 18 m/s, donc sans temps mort la ruée serait le moyen de
  déplacement le plus rapide du jeu et casserait la règle « une seule vitesse
  pour tout le monde ». Mesuré en ruant en boucle et en avançant pendant le coup
  lourd : **77,9 m en 10 s contre 80,9 m en courant** (7,7 contre 8,1 m/s en
  régime établi). La marge est mince : sur 5 s, la ruée gagne de peu (41,0
  contre 40,2 m) parce qu'elle commence par sa pointe de vitesse.

**Ruée** — clic droit, **à l'épée seulement** : aux poings, le clic droit ne fait
rien. 18 m/s sur 7 m, **direction figée au départ**, arrêt sur
le premier ennemi, sur le mur, ou à bout de distance. Sur un ennemi : 12 dégâts
et 0,35 s d'étourdissement, puis le coup lourd. Dans le vide : le coup lourd
part quand même.

C'est un outil d'**engagement**, pas de fuite : elle ne se pilote pas, et s'en
servir pour s'échapper oblige à tourner le dos puis à passer 1 s ralenti, sans
saut. Mesuré :
impact à 0,23 s pour 12 dégâts, coup lourd à 0,68 s pour 30. **L'enchaînement
n'est pas garanti** : la cible peut sortir par une esquive entre 0,3 et 0,45 s
après l'impact de ruée (vérifié).

**Attaque sautée à l'épée (plongeon)** — clic gauche en l'air. Le personnage se
fige 0,28 s, puis tombe à la verticale sur sa propre position à 26 m/s. À
l'impact : 26 dégâts et **0,8 s d'étourdissement** dans un cône de 3,6 m devant,
sur tous les ennemis à la fois, puis **0,5 s de récupération** — aucun contrôle du
personnage : ni déplacement, ni saut, ni attaque, ni esquive. Volontairement non
annulable : une esquive qui l'annulerait la rendrait gratuite pour qui a de la
jauge. Cycle plancher mesuré en spammant : **0,8 s par plongeon**, dont 0,78 s
d'immobilité totale.

La suspension est la seule vraie fenêtre de télégraphe du jeu, et elle ne coûte
rien au ping : c'est *l'attaquant* qui s'immobilise, pas la lecture de l'adversaire.
L'épée en l'air ne frappe donc plus normalement.

**Longue hache** — touche `3` (debug). Façon Counter Sword de S4 League, avec le
tourbillon de la batte au clic droit à la place de la garde. Le jeu n'aura que des
armes de corps à corps.

- **Enchaînement** : un clic pendant un coup est gardé, et le coup suivant part dès
  que celui-ci se termine — jusqu'à trois gestes différents : balayage, revers,
  taille par-dessus la tête. 24 / 24 / 30 dégâts, 0,7 s par coup, 3,6 m de portée.
  Le 3ᵉ projette un peu : 2,8 m, apex 0,27 m (mesuré). Un clic jusqu'à 0,25 s après
  la fin d'un coup enchaîne encore ; au-delà, on repart du premier. Encaisser casse
  l'enchaînement.
- **Coup lourd** : l'uppercut de la Counter Sword. Même projection que l'épée, mais
  à **4,4 m** : il touche à 4,2 m, là où l'épée rate.
- **En l'air** : plongeon, comme l'épée.
- **Tourbillon** (clic droit) : un tour à 360° par clic, ou tant qu'on maintient le
  clic droit, **3 d'affilée maximum**. Chaque tour touche une fois chaque cible à
  3,2 m, devant comme derrière, à mi-tour : 12 dégâts. Le 3ᵉ repousse un peu
  (2,8 m). On tourne **ralenti** à 3,66 m/s comme pour toute attaque, et **sans
  esquive** (Espace + Q/D saute) : sinon le tourbillon devient une sortie
  d'encerclement, et il protège le porteur d'aura (§9). Un coup encaissé avant
  l'impact annule le tour et arrête l'enchaînement, même clic droit maintenu. Après
  le dernier tour, 0,35 s de retour en garde : la jauge est pleine 0,8 s après un
  tour seul.

> **L'étourdissement est annulable.** L'ennemi est totalement bloqué 0,3 s, puis
> peut s'extraire avec une esquive — qui lui coûte une demi-jauge. C'est le seul
> blocage de contrôle du jeu : court, annulable, et coûteux pour celui qui s'en
> sort. Sans ces trois conditions ce serait une immobilisation, et une
> immobilisation sur le porteur d'aura serait bien plus qu'un ralentissement.

**Lisibilité de l'attaque** (§5 : le combat repose sur la lecture)

Chaque arme a son propre geste, et chacun est contraint par le même problème :
la caméra 3ᵉ personne regarde par la tranche tout plan contenant l'axe avant, et
la capsule du joueur masque tout ce qui passe dans son axe.

Tous les coups se jouent en **trois temps**, comme dans un jeu de combat :
**armement** (le début du délai d'impact, c'est lui qui annonce le coup),
**frappe** (0,08 s, 0,12 s pour le lourd, qui accélère jusqu'à l'impact : la lame
arrive sur la cible exactement quand les dégâts tombent), puis **retour**, qui
s'achève quand la jauge est pleine. Un coup annulé ne joue jamais sa frappe : la
pose revient au repos depuis là où elle a été interrompue, et y arrive elle aussi
quand la jauge est pleine.

- **Épée** : taille descendante de 205° dans un plan **diagonal** (lacet 34°,
  roulis 45°), après un armement qui lève la lame au-dessus de l'épaule. Un
  balayage vertical se ferait dans le plan sagittal, invisible quelle que soit
  son ampleur. Torsion du torse de 62°, lame plate et large, flash émissif qui
  culmine à l'impact, traînée de pointe pendant la frappe.
- **Poings** : deux **gants** — des cubes qui vont et viennent **droit devant**,
  avec un léger balancement de garde. Un membre qui s'allonge donnait un rendu
  de bloc Minecraft ; un gant qui part et revient lit comme un coup de poing.
  Aucune torsion du buste pendant le coup : elle ferait pivoter la trajectoire
  et le poing partirait en diagonale. Les gants sont posés bien au-delà du rayon
  de la capsule, sinon ils sont simplement invisibles — et ils **disparaissent
  quand l'épée est équipée**, la lame portant toute l'animation.
- **Coup lourd** : balayage **horizontal**, autour de l'axe vertical, de la
  droite vers l'avant. La version précédente tournait autour de l'axe latéral et
  finissait pointe au sol, ce qui ne ressemblait pas à un coup porté devant soi.
  Son armement ramène la lame loin sur la droite et l'**embrase
  progressivement** : c'est le télégraphe du coup. Aux poings, le gant recule
  avant de partir.
- **Longue hache** : un manche long et une lame haute en bout, dans le métal de
  l'épée pour que l'éclat des coups s'y lise pareil. Les deux balayages tournent
  autour de l'axe vertical, la taille finale dans le plan diagonal de l'épée.
  L'uppercut passe dans le plan **miroir** : dans celui de la taille, « en bas »
  veut dire en bas à gauche, et la lame armée disparaissait derrière la capsule.
  Au tourbillon, tout le buste fait un tour complet par tour, hache tendue sur le
  côté, à vitesse constante pour que les tours s'enchaînent sans à-coup.
- **Plongeon** : lame droite au-dessus de la tête pendant la suspension, pointée
  vers le bas pendant la chute, **plantée dans le sol** pendant la récupération,
  le buste penché dessus qui se redresse. C'est cette pose qui rend la
  récupération lisible de l'extérieur — on voit qu'il ne peut rien faire.
- **Aucun recul sur un coup normal** : encaisser ne déplace pas. Le coup se lit au
  flash et à l'écrasement de la capsule, pas à un rebond. Seul le coup lourd projette.
- Invulnérabilité de 0,4 s après un coup reçu, sinon deux attaquants tuent en une seconde.

**TTK mesuré** (cible §8 : 2–4 s)

| Configuration | Coups | TTK |
|---|---|---|
| Épée contre 100 PV (niveau 1) | 5 | **2,47 s** |
| Épée contre 140 PV (niveau max) | 7 | **3,70 s** |
| Longue hache contre 100 PV, en recollant après la projection | 4 | **2,13 s** |
| Longue hache contre 140 PV | 6 | **3,57 s** |
| Poings contre 100 PV | 10 | 4,20 s |

Le niveau max reste dans la fenêtre : la rampe de PV ne casse pas la garantie
« trois joueurs battent toujours un joueur ». Mesuré du premier coup à la mort :
la cadence est la durée du coup normal, calée sur l'ancienne recharge (0,6 s à
l'épée, 0,45 s aux poings), donc ces chiffres n'ont pas bougé — seul le premier
coup arrive 0,08 s plus tard qu'à l'origine.

**Progression** — niveau = score, série, paliers 3/5/8 avec aura + colonne de
lumière, XP dépendant de l'équipement et de la série de la victime (un mannequin
nu rapporte 35, un joueur niveau 5 avec 3 de série et une épée en rapporte 190).
Mort = retour niveau 1, sans équipement, série à zéro.

**Caméra** 3ᵉ personne façon Marvel Rivals : corps verrouillé sur le yaw caméra
(on strafe, on ne pivote pas), décalage épaule droite, réticule fixe, FOV large qui
s'ouvre au sprint.

**Carte** `packages/shared/src/maps/arene-vide.json` — arène circulaire vide, anneaux
du gradient spatial tracés au sol, apparitions sur l'anneau périphérique.

## Ce qui est volontairement absent

Rien de tout ceci ne doit être construit avant que le combat soit validé **en réseau**
(§7) :

- réseau, serveur, Colyseus, prédiction, réconciliation
- butin, barils, coffres, armure — les armes sont données par des touches de debug
- prime partagée (la trace des contributeurs sur 10 s existe déjà dans la sim)
- sas d'entrée — remplacé par une apparition périphérique + 1,5 s de protection
- vrai PvE : les mannequins sont des partenaires d'entraînement, pas un choix de design
- modèles, animations, sons (et plus d'arc du tout : que du corps à corps)

---

## Architecture

```
packages/shared/   @bougie/shared — la simulation. Zéro dépendance moteur.
  math.ts          vecteurs, convention de yaw (identique à PlayCanvas)
  constants.ts     TOUT ce qui se règle, avec le renvoi à la section de CLAUDE.md
  combat.ts        armes, jauge de coup, sélection de cible
  progression.ts   XP, niveaux, paliers
  world.ts         la simulation à pas fixe
  ia.ts            mannequins d'entraînement
  maps/*.json      les niveaux (§6 : diffables, lus par le client ET le serveur)

apps/client/       @bougie/client — PlayCanvas. Dessine et lit les entrées, rien d'autre.
```

**La simulation n'importe jamais PlayCanvas.** C'est la condition pour que le jour où
le serveur arrive, ce soit exactement ce même `World` qui tourne côté serveur et que
le client se contente de rejouer ses entrées par-dessus (§4). Le client alimente la sim
avec des **intentions** (`Entree`), jamais des positions.

Pas à fixe de 60 Hz avec accumulateur : indispensable pour que prédiction client et
autorité serveur convergent.

## Les boutons à tourner

Tout est dans `packages/shared/src/constants.ts`, et les trois qui comptent :

- `PORTEE_AURA_PALIER_*` — **§3 priorité 2**, probablement la variable la plus
  importante du jeu. Trop court, la coalition n'émerge jamais ; trop long, plus
  personne ne s'approche du leader.
- `PV_AU_NIVEAU_MAX` — marqué « à confirmer » dans CLAUDE.md. Le mettre à `100` rend
  le niveau strictement cosmétique, ce qui reste une option valide.
- `INVULN_APRES_COUP` — la cadence réelle des échanges quand plusieurs joueurs
  frappent la même cible. C'est lui qui décide si trois joueurs sont trois fois plus
  rapides qu'un seul, ou pas.
- `WINDUP_NORMAL` / `WINDUP_LOURD` — la lenteur des coups, donc la fenêtre pendant
  laquelle on peut les annuler. `LOURD_POUSSEE` / `LOURD_ELAN` — la projection.
  `ARMES[].dureeSwing` (dans `combat.ts`) — la durée d'un coup normal, donc la
  cadence et le TTK.
- `REGEN_ESQUIVE` / `COUT_ESQUIVE` — combien d'esquives d'affilée, et à quel rythme
  elles reviennent. C'est le seul levier qui décide si l'esquive reste une réponse
  ou redevient un mode de déplacement — et donc si le corps à corps existe encore.
  À surveiller avec la métrique §8 « durée médiane d'une série au palier 8 » :
  si elle dépasse 90 s, c'est probablement ici.

## Git

`git lfs install` avant d'ajouter le moindre binaire — `.gitattributes` est déjà en
place (§6). Un asset binaire appartient à une seule personne à la fois : Git ne
fusionne pas les `.glb`.
