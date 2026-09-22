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
| **D + Espace** / **Q + Espace** | esquiver à droite / à gauche, au sol **ou en l'air**. Direction **purement latérale** : en diagonale, Espace saute. |
| Clic gauche | frapper |
| Clic gauche **maintenu** | coup lourd : repousse et étourdit |
| **Clic droit** | ruée en ligne droite ; sur un ennemi, enchaîne un coup lourd |
| Clic gauche **en l'air, à l'épée** | plongeon : suspension, chute verticale, étourdit devant |
| Molette souris / déplacement | viser (caméra 3ᵉ personne épaule droite) |
| `1` / `2` | poings / épée — **debug**, l'épée ne se ramasse nulle part |
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
- Le coup est **instantané au clic** — aucune fenêtre de télégraphe à lire, donc
  rien qui fonde à 80 ms de ping. C'était le défaut rédhibitoire du pierre-papier-ciseaux.
- Jauge de charge sous le réticule. Dégâts = `0.2 + 0.8·t²` : cliquer vite reste
  possible mais devient mathématiquement mauvais. La sanction du spam est dans la
  courbe, pas dans un verrou.
- **Un swing visible = un coup réel**, toujours. L'intervalle minimum entre deux
  attaques vaut exactement la durée de l'animation (0,3 s), donc elle ne peut
  jamais être relancée en cours de route.
- **Attaquer engage.** L'attaquant tombe à 3,66 m/s pendant son swing, et
  encaisser ralentit aussi, 0,35 s. **Une esquive annule le ralentissement.**
  C'est ce qui donne de l'inertie au corps à corps sans ajouter la moindre
  résistance aux dégâts.

**Aucune attaque n'est instantanée** (Plasma Sword de S4 League). Entre la
décision et l'impact il y a un délai — 0,12 s pour un coup normal, 0,25 s pour un
coup lourd — pendant lequel l'animation part et **l'attaque est interruptible** :

> **Encaisser un coup annule le sien.** C'est ce qui remplace le recul sur un
> coup normal : interrompre vaut mieux que déplacer, et ça ne casse ni les
> distances ni la lisibilité du combat. Vérifié sur les deux types de coups —
> attaque en vol annulée, cible intacte.

Le pari de §3 tient : ce n'est pas une fenêtre de *lecture*. Personne n'a à lire
l'animation adverse pour choisir une réponse en 120 ms. C'est l'attaquant qui
s'expose, et l'annulation est un effet, pas une décision.

**Clic bref ou maintien.** Rien ne part à l'appui : c'est la durée du maintien
qui tranche, à 0,18 s. Relâché avant, c'est un coup normal ; toujours enfoncé,
c'est un coup lourd. Il n'y a **pas de barre à remplir**, et surtout un coup
lourd n'est jamais précédé d'un coup normal. Maintenir enchaîne les coups lourds.

**Coup lourd** — 30 dégâts, poussée horizontale de 1,7 m (sans rebond vertical),
0,35 s d'étourdissement.

**Aucun cooldown, ni sur le coup lourd ni sur la ruée.** Ce qui les limite :

- Le coup lourd **immobilise pendant tout son exécution**, du lancement à la fin
  de la récupération. Enchaîner les coups lourds, c'est rester planté au milieu
  de l'arène.
- La ruée a une récupération de 0,55 s **seulement quand elle ne touche rien**.
  Ce n'est pas décoratif : 7 m en 0,39 s font 18 m/s, donc sans elle la ruée
  serait le moyen de déplacement le plus rapide du jeu et casserait la règle
  « une seule vitesse pour tout le monde ». Mesuré sur 5 s : **38,1 m en ruant
  en boucle contre 40,2 m en courant**. Ruer pour avancer est une perte de temps.
  Quand elle touche, il n'y a aucun temps mort ajouté : c'est le coup lourd
  enchaîné qui immobilise.

**Ruée** — clic droit. 18 m/s sur 7 m, **direction figée au départ**, arrêt sur
le premier ennemi, sur le mur, ou à bout de distance. Sur un ennemi : 12 dégâts,
0,35 s d'étourdissement, puis un coup lourd enchaîné 0,62 s plus tard.

C'est un outil d'**engagement**, pas de fuite : elle ne se pilote pas, et s'en
servir pour s'échapper oblige à tourner le dos. Mesuré : impact à 0,23 s pour
12 dégâts, coup lourd à 0,48 s pour 30, puis 1,8 s d'immobilité.

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
L'épée en l'air ne frappe donc plus normalement ; le coup critique en retombant
reste aux poings.

> **L'étourdissement est annulable.** L'ennemi est totalement bloqué 0,3 s, puis
> peut s'extraire avec une esquive — qui lui coûte une demi-jauge. C'est le seul
> blocage de contrôle du jeu : court, annulable, et coûteux pour celui qui s'en
> sort. Sans ces trois conditions ce serait une immobilisation, et une
> immobilisation sur le porteur d'aura serait bien plus qu'un ralentissement.

**Lisibilité de l'attaque** (§5 : le combat repose sur la lecture)

Chaque arme a son propre geste, et chacun est contraint par le même problème :
la caméra 3ᵉ personne regarde par la tranche tout plan contenant l'axe avant, et
la capsule du joueur masque tout ce qui passe dans son axe.

- **Épée** : taille descendante de 205° dans un plan **diagonal** (lacet 34°,
  roulis 45°). Un balayage vertical se ferait dans le plan sagittal, invisible
  quelle que soit son ampleur. Torsion du torse de 62°, lame plate et large,
  flash émissif, traînée de pointe.
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
- **Plongeon** : lame droite au-dessus de la tête pendant la suspension, pointée
  vers le bas pendant la chute, **plantée dans le sol** pendant la récupération,
  le buste penché dessus qui se redresse. C'est cette pose qui rend la
  récupération lisible de l'extérieur — on voit qu'il ne peut rien faire.
- **Coup critique** en frappant pendant la retombée, à charge pleine. Le seul vrai
  skill-check du système, et il ne dépend d'aucune lecture de l'adversaire.
- **Aucun recul à l'impact** : encaisser ne déplace pas. Le coup se lit au flash et à
  l'écrasement de la capsule, pas à un rebond.
- Invulnérabilité de 0,4 s après un coup reçu, sinon deux attaquants tuent en une seconde.

**TTK mesuré** (cible §8 : 2–4 s)

| Configuration | Coups | TTK |
|---|---|---|
| Épée contre 100 PV (niveau 1) | 5 | **2,47 s** |
| Épée contre 140 PV (niveau max) | 7 | **3,70 s** |
| Poings contre 100 PV | 10 | 4,20 s |

Le niveau max reste dans la fenêtre : la rampe de PV ne casse pas la garantie
« trois joueurs battent toujours un joueur ».

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
- butin, barils, coffres, armure — l'épée est donnée par une touche de debug
- prime partagée (la trace des contributeurs sur 10 s existe déjà dans la sim)
- sas d'entrée — remplacé par une apparition périphérique + 1,5 s de protection
- vrai PvE : les mannequins sont des partenaires d'entraînement, pas un choix de design
- arc, modèles, animations, sons

---

## Architecture

```
packages/shared/   @bougie/shared — la simulation. Zéro dépendance moteur.
  math.ts          vecteurs, convention de yaw (identique à PlayCanvas)
  constants.ts     TOUT ce qui se règle, avec le renvoi à la section de CLAUDE.md
  combat.ts        armes, courbe de charge, sélection de cible
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
- `REGEN_ESQUIVE` / `COUT_ESQUIVE` — combien d'esquives d'affilée, et à quel rythme
  elles reviennent. C'est le seul levier qui décide si l'esquive reste une réponse
  ou redevient un mode de déplacement — et donc si le corps à corps existe encore.
  À surveiller avec la métrique §8 « durée médiane d'une série au palier 8 » :
  si elle dépasse 90 s, c'est probablement ici.

## Git

`git lfs install` avant d'ajouter le moindre binaire — `.gitattributes` est déjà en
place (§6). Un asset binaire appartient à une seule personne à la fois : Git ne
fusionne pas les `.glb`.
