# État du projet — à lire en début de session

Ce fichier dit **où on en est**. `CLAUDE.md` dit ce qu'on veut faire (le design,
verrouillé). `README.md` dit comment le code marche. Celui-ci dit ce qui est
construit, ce qui a été décidé en cours de route, et ce qui reste ouvert.

**Dernière mise à jour : 23 septembre 2026.**

---

## 1. Où on en est

**Étape §7 semaine 1** : la sensation du combat, en local, avec des capsules.
Aucun réseau. La question à laquelle ce dépôt doit répondre est toujours la même :
*est-ce que le combat est agréable ?*

Le monorepo est en place, le prototype tourne, tout est mesuré. Ce qui manque
pour clore l'étape 1, c'est **ton jugement en jouant** — pas du code.

```bash
npm install && npm run dev     # http://localhost:5173
```

## 2. Règles de travail

- **Les commandes git, c'est l'utilisateur.** Ne jamais lancer `git` (voir
  `CLAUDE.md` §6). Écrire les fichiers, dire ce qu'il reste à committer.
- **Vérifier dans le navigateur, pas seulement compiler.** En dev,
  `window.__arene` expose `{ app, monde, moi, camera, acteurs, entrees, hud }`.
  Le volet navigateur gèle `requestAnimationFrame` quand il est masqué : piloter
  la boucle à la main avec `d.app.update(1/60)` puis `d.app.render()`, après
  `d.app.timeScale = 0` pour que la boucle automatique n'avance pas en parallèle.
  `entrees.verrouille = true` et `entrees.boutonEnfonce = true` simulent un clic
  maintenu sans pointer lock. Pour mesurer sans toucher à la partie en cours :
  `new d.monde.constructor(d.monde.carte)` donne un monde vierge.
- **Annoncer les chiffres mesurés, pas les chiffres visés.** Tout ce qui est
  affirmé ci-dessous a été mesuré en exécutant la simulation.

## 3. Ce qui est construit

| Domaine | État |
|---|---|
| Monorepo, sim partagée sans dépendance moteur, client PlayCanvas | fait |
| Déplacement calibré Quake Live, saut, esquive latérale à jauge | fait |
| Combat : coup normal, coup lourd qui projette, plongeon, ruée, étourdissement | fait |
| Animation d'attaque en trois temps (armement, frappe, retour), annulation visible | fait |
| Interruption des attaques (S4 League) | fait |
| Progression : XP, niveaux, séries, paliers 3/5/8 avec aura | fait |
| Caméra 3ᵉ personne façon Marvel Rivals | fait |
| HUD : PV, XP, série, vitesse, étourdissement, kill feed, plaques | fait |
| Jauge sous le réticule calée sur la fin de l'animation du coup | fait |
| Longue hache : enchaînement de 3 coups, uppercut, plongeon, tourbillon | fait |
| Réseau, butin, prime, sas, modèles, animations, sons | **rien** |

Valeurs mesurées : TTK épée 2,5 s (cible §8 : 2–4 s), course 8,13 m/s,
saut apex 1,55 m, esquive 3,73 m, latence de rendu 9,7 ms. Coup normal : impact
0,25 s après l'appui, coup suivant possible à 0,6 s (épée) / 0,45 s (poings).
Coup lourd : impact 0,65 s après l'appui, cible projetée à 6,1 m avec un apex de
1,15 m, attaquant ralenti à 3,66 m/s pendant 1 s (il peut sauter).

## 4. Décisions prises pendant le prototypage

Elles ne sont pas dans `CLAUDE.md` parce qu'elles n'étaient pas dans le design
initial. **Toutes viennent de l'utilisateur sauf mention contraire.**

| Décision | Conséquence |
|---|---|
| Combat à l'épée : coups simples style Minecraft, pas de garde | Ferme la §3 priorité 1 pour l'instant |
| Aucun recul sur un coup normal | Remplacé par l'annulation d'attaque |
| Vitesse unique calibrée sur Quake Live, pas de sprint | Une seule vitesse pour tout le monde |
| Contrôle aérien total | Écart assumé avec Quake : sans strafe-jump, le demi-tour en l'air était impossible |
| Esquive latérale sur jauge, sans invulnérabilité | *(moi)* Des i-frames protégeraient le porteur d'aura — §2 les rejette |
| Attaques non instantanées + annulation quand on encaisse | Le délai est subi, pas lu : le ping ne le mange pas |
| Clic bref / maintien, sans barre de charge | Un coup lourd n'est jamais précédé d'un coup normal |
| Aucun cooldown sur le coup lourd ni la ruée | Remplacés par l'armement long et le verrou d'actions du coup lourd (1 s) |
| Plafond dur sur la vitesse réelle | *(moi)* Corrige un gain de vitesse le long du mur ; ferme toute possibilité de strafe-jump |
| Coups façon Street Fighter : le fort part bien plus tard que le moyen | Délai d'impact 0,2 s (normal) / 0,45 s (lourd) ; un normal lancé pendant l'armement d'un lourd l'annule |
| Coup lourd lent qui repousse beaucoup plus et fait décoller | Projection 6,1 m, apex 1,15 m |
| Cible étourdie pendant tout le vol | *(moi)* Le contrôle aérien total lui rendait la main en plein vol et annulait la projection |
| Un maintien = un seul coup lourd | Il faut relâcher pour en relancer un |
| La ruée se conclut toujours par un coup lourd, touché ou non | Remplace la récupération de ruée à vide (supprimée) |
| Étourdi = aucune attaque | *(moi)* Bug : les attaques passaient pendant l'étourdissement, une cible projetée à l'épée plongeait pour en sortir |
| Un coup annulé ne joue pas sa frappe | *(moi)* Avec des armements longs, la frappe fantôme devenait fréquente — « un swing visible = un coup réel » |
| Jauge du réticule alignée sur la fin de l'animation | Durée du coup normal par arme = ancienne recharge (0,45 / 0,6 s) : TTK inchangé. Plus de courbe de dégâts Minecraft, on ne peut plus frapper avant la fin du coup |
| On bouge (ralenti) et on saute pendant le coup lourd, sauf saut pendant celui de la ruée | La récupération immobile de 0,3 s est fondue dans l'animation, qui dure 1 s |
| Ni esquive ni ruée pendant le coup lourd | *(moi)* L'esquive laverait le ralentissement ; la ruée annulerait le coup lourd qu'elle vient d'enchaîner et, ruée sur ruée, on filerait à 18 m/s |
| Plus de coup critique en retombant aux poings | Jamais demandé, retiré. Le marqueur doré reste pour un plongeon qui touche |
| Pendant un coup lourd, Espace + Q/D saute | L'esquive y étant interdite, la touche ne faisait rien : impossible de sauter en strafant. Pendant un coup normal, c'est toujours l'esquive |
| Ruée à l'épée seulement | Aux poings, le clic droit ne fait rien |
| **Que des armes de corps à corps : pas d'arc** | Pas de frustration pour qui ne veut jouer qu'au contact. Remplace « épée et arc » de `CLAUDE.md` §2 et rend sans objet les questions sur l'arc (§3, §5) |
| Longue hache façon Counter Sword de S4 : enchaînement de 3 coups au clic (un clic pendant un coup est gardé pour le suivant), uppercut au maintien, plongeon en l'air | Le 3ᵉ coup projette un peu (2,8 m). TTK 2,13 s sur 100 PV en recollant |
| Clic droit de la hache = tourbillon de la batte, sans timing : un tour par clic ou tant qu'on maintient, 3 d'affilée max, le dernier repousse | Remplace la garde de la Counter Sword |
| Tourbillon ralenti, comme toute attaque | Sinon il devient une sortie d'encerclement, qui protège le porteur d'aura (§9) |
| Pas d'esquive pendant le tourbillon (Espace + Q/D saute) | *(moi)* Même raison que pour le coup lourd : elle laverait le ralentissement |
| Portée du coup lourd par arme : 4,4 m à la hache | *(moi)* L'uppercut de la Counter Sword porte loin ; l'épée et les poings restent à 3,4 m |

## 5. Ouvert — à trancher en jouant

1. **`PORTEE_AURA_PALIER_*`** — §3 priorité 2, probablement la variable la plus
   importante du jeu. 35 / 70 / infini pour l'instant, posé au jugé. C'est le
   nombre qui décide si la coalition se forme.
2. **`PV_AU_NIVEAU_MAX`** — marqué « à confirmer » dans `CLAUDE.md`. À 140
   aujourd'hui ; le mettre à 100 rend le niveau strictement cosmétique.
3. **Bouger pendant le coup lourd de la ruée.** La consigne interdit le saut
   pendant ce coup lourd ; lue à la lettre, elle laisse le déplacement. Mesuré en
   ruant en boucle et en avançant : 7,7 m/s contre 8,1 m/s en courant (77,9 m
   contre 80,9 m sur 10 s), et la ruée gagne sur 5 s (41,0 contre 40,2 m). La
   règle « une seule vitesse » tient, de peu. Question posée le 23 septembre :
   rendre ce coup lourd-là immobile ?
4. **La ruée est le troisième outil de mobilité** à l'épée, après l'esquive et le saut.
   Construite comme un outil d'engagement (direction figée, pas de pilotage),
   elle reste 7 m instantanés pour celui qui se fait focaliser, suivis d'1 s
   ralenti sans saut.
5. **La projection est l'outil de dégagement du jeu** : 6,1 m entre l'attaquant
   et sa cible. Ce qui l'empêche de protéger le porteur d'aura, c'est l'armement
   long et annulable : encerclé, il se fait interrompre. À vérifier à 8.
6. **`RUEE_INVULN`** ne conditionne plus le combo depuis que `WINDUP_LOURD`
   (0,45 s) dépasse l'invulnérabilité normale (0,4 s). La garder (les alliés
   frappent plus tôt une cible ruée) ou revenir à la normale ?
7. **Rôle du PvE** — toujours ouvert (§3). Les mannequins sont des partenaires
   d'entraînement, pas un choix de design.
8. **Chiffres de la longue hache** — posés au jugé : 24/24/30 dégâts, 0,7 s par
   coup, tourbillon 12 dégâts par tour à 3,2 m. Dans S4, l'uppercut de la Counter
   Sword touche tout un cône ; ici une seule cible, comme le coup lourd de l'épée.
   À régler en jouant.

*Résolu le 23 septembre :* la sortie par esquive contre le combo de ruée. Avec
`WINDUP_LOURD` à 0,45 s, elle est possible entre 0,3 et 0,45 s après l'impact
(vérifié en simulation). Et la jauge du réticule : alignée sur la fin de
l'animation.

## 6. Pièges déjà rencontrés — ne pas les refaire

**Rendu**

- La caméra regarde par la tranche **tout plan contenant l'axe avant**. Un
  balayage vertical d'épée y est invisible quelle que soit son ampleur. Il faut
  incliner le plan **en lacet**, pas seulement en roulis : une rotation autour de
  Z laisse la normale perpendiculaire à la vue.
- **La capsule masque tout ce qui passe dans son axe.** Bras, gants, arme :
  tout ce qui doit se voir est posé au-delà du rayon de la capsule.
- **Ne pas empiler les lissages.** Position rendue *et* pivot caméra faisaient
  74 ms de retard cumulé, ressentis comme un temps mort au démarrage.
- **L'ordre des poses compte.** Le coup lourd met aussi en récupération : testée
  avant lui, la pose « épée plantée » du plongeon écrasait son animation.
- `dernierCoupA` est écrit par **tous** les coups (normal, lourd, plongeon, tour).
  Le rendu du coup normal doit vérifier que le dernier coup en était bien un,
  sinon la fin de récupération d'un plongeon rejoue un retour de coup d'épée.
- Dans le plan diagonal de la taille, « en bas » veut dire **en bas à gauche** :
  un coup qui part du bas y est caché derrière la capsule. Les coups montants
  passent dans le plan miroir (roulis +45°).
- La sim remet l'enchaînement à zéro quand on encaisse : le rendu fige le rang du
  coup à son départ, sinon le geste en cours change de forme en plein vol.
- Un cylindre PlayCanvas est **fermé** : son capuchon haut recouvre le ciel et
  son capuchon bas se bat en profondeur avec le sol.
- Les primitives du composant `render` n'ont pas de dimensions. La capsule par
  défaut fait 0,3 × 1,0 — il faut construire le maillage à la main pour coller à
  la hitbox.

**Simulation**

- L'accélération de Quake ne borne que la **projection** de la vitesse sur
  l'intention, pas sa norme. Toute contrainte qui retire une composante à chaque
  tick (le mur) fait accumuler le reste.
- Le navigateur rapporte les touches **selon la disposition** : sur AZERTY, la
  touche du W envoie `Z`. Accepter les deux jeux.
- `keydown` se répète tant que la touche est tenue : filtrer les vrais fronts.
- Une vitesse de projection **ajoutée** à celle de la cible s'annule quand la
  cible fonce sur l'attaquant : l'imposer.
- Au tick de la projection, `auSol` est encore vrai : le forcer à `false`, sinon
  le premier tick applique la friction du sol.
- Toute fenêtre qui lève le plafond de vitesse (`finPoussee`) doit être refermée
  par l'esquive, sinon l'esquive aérienne devient un vol plané.
- `lancerAttaque` échoue en silence (récupération, esquive, verrou) : ne
  jamais marquer un maintien comme consommé avant que le coup soit vraiment parti.
- Dès que le coup lourd ne bloque plus le déplacement, **rien** ne l'empêche
  d'être annulé par une ruée : il faut le garde explicite (`enCoupLourd`), sinon
  ruée → coup lourd → ruée file à 18 m/s.
- Deux impacts au même tick se résolvent dans l'ordre des entités, et l'horloge
  à 60 Hz cumulée en flottants peut décaler un impact d'un tick. Pour tester une
  annulation, donner au coup qui doit gagner une avance nette (≥ 2 ticks).
- Pendant l'édition, Vite loggue « does not provide an export named … » quand un
  fichier qui exporte est enregistré avant ceux qui importent. Transitoire :
  recharger avant de conclure à un bug.

## 7. Prochaine étape

`CLAUDE.md` §7 est explicite et n'a pas bougé : **le même combat en réseau, 1v1,
avec 80 ms de latence injectée.** Pas les modèles, pas les animations, pas le
contenu. Si le système survit au ping, le projet est viable.

La sim n'importe rien de PlayCanvas, donc c'est exactement le même `World` qui
tournera côté serveur. Les briques de netcode se posent dans l'ordre de §4, une
par une, quand la sensation devient mauvaise — pas d'avance.

Avant ça, une seule chose vaut le coup : **jouer et dire si le combat est
agréable.** C'est la question de l'étape 1, et elle n'est pas encore tranchée.
