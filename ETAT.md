# État du projet — à lire en début de session

Ce fichier dit **où on en est**. `CLAUDE.md` dit ce qu'on veut faire (le design,
verrouillé). `README.md` dit comment le code marche. Celui-ci dit ce qui est
construit, ce qui a été décidé en cours de route, et ce qui reste ouvert.

**Dernière mise à jour : 22 septembre 2026.**

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
  la boucle à la main avec `d.app.update(1/60)` puis `d.app.render()`.
- **Annoncer les chiffres mesurés, pas les chiffres visés.** Tout ce qui est
  affirmé ci-dessous a été mesuré en exécutant la simulation.

## 3. Ce qui est construit

| Domaine | État |
|---|---|
| Monorepo, sim partagée sans dépendance moteur, client PlayCanvas | fait |
| Déplacement calibré Quake Live, saut, esquive latérale à jauge | fait |
| Combat : coup normal, coup lourd, plongeon, ruée, étourdissement | fait |
| Interruption des attaques (S4 League) | fait |
| Progression : XP, niveaux, séries, paliers 3/5/8 avec aura | fait |
| Caméra 3ᵉ personne façon Marvel Rivals | fait |
| HUD : PV, XP, série, vitesse, étourdissement, kill feed, plaques | fait |
| Réseau, butin, prime, sas, arc, modèles, animations, sons | **rien** |

Valeurs mesurées : TTK épée 2,5 s (cible §8 : 2–4 s), course 8,13 m/s,
saut apex 1,55 m, esquive 3,73 m, latence de rendu 9,7 ms.

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
| Aucun cooldown sur le coup lourd ni la ruée | Remplacés par l'immobilité et la récupération |
| Plafond dur sur la vitesse réelle | *(moi)* Corrige un gain de vitesse le long du mur ; ferme toute possibilité de strafe-jump |

## 5. Ouvert — à trancher en jouant

1. **`PORTEE_AURA_PALIER_*`** — §3 priorité 2, probablement la variable la plus
   importante du jeu. 35 / 70 / infini pour l'instant, posé au jugé. C'est le
   nombre qui décide si la coalition se forme.
2. **`PV_AU_NIVEAU_MAX`** — marqué « à confirmer » dans `CLAUDE.md`. À 140
   aujourd'hui ; le mettre à 100 rend le niveau strictement cosmétique.
3. **L'esquive de sortie ne fonctionne plus contre le combo de ruée.**
   L'étourdissement dure 0,35 s, la sortie est possible à 0,3 s, mais le coup
   lourd enchaîné arrive à 0,25 s : il passe avant. L'enchaînement est donc
   garanti. Levier : `WINDUP_LOURD`.
4. **La ruée est le troisième outil de mobilité**, après l'esquive et le saut.
   Construite comme un outil d'engagement (direction figée, pas de pilotage),
   mais elle reste 7 m instantanés pour celui qui se fait focaliser.
5. **Rôle du PvE** — toujours ouvert (§3). Les mannequins sont des partenaires
   d'entraînement, pas un choix de design.

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
- Un cylindre PlayCanvas est **fermé** : son capuchon haut recouvre le ciel et
  son capuchon bas se bat en profondeur avec le sol.
- Les primitives du composant `render` n'ont pas de dimensions. La capsule par
  défaut fait 0,3 × 1,0 — il faut construire le maillage à la main pour coller à
  la hitbox.

**Simulation**

- L'accélération de Quake ne borne que la **projection** de la vitesse sur
  l'intention, pas sa norme. Toute contrainte qui retire une composante à chaque
  tick (le mur) fait accumuler le reste.
- Lire la charge **avant** d'écraser `dernierCoupA`, sinon elle vaut toujours zéro.
- Le navigateur rapporte les touches **selon la disposition** : sur AZERTY, la
  touche du W envoie `Z`. Accepter les deux jeux.
- `keydown` se répète tant que la touche est tenue : filtrer les vrais fronts.

## 7. Prochaine étape

`CLAUDE.md` §7 est explicite et n'a pas bougé : **le même combat en réseau, 1v1,
avec 80 ms de latence injectée.** Pas les modèles, pas les animations, pas le
contenu. Si le système survit au ping, le projet est viable.

La sim n'importe rien de PlayCanvas, donc c'est exactement le même `World` qui
tournera côté serveur. Les briques de netcode se posent dans l'ordre de §4, une
par une, quand la sensation devient mauvaise — pas d'avance.

Avant ça, une seule chose vaut le coup : **jouer et dire si le combat est
agréable.** C'est la question de l'étape 1, et elle n'est pas encore tranchée.
