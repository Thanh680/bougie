import * as pc from 'playcanvas'
import {
  ARMES,
  CHARGE_DUREE,
  COUP_DOS_DELAI,
  DELAI_DOUBLE_COUP,
  DUREE_ESQUIVE,
  ECRASEMENT_WINDUP,
  FAUCHE_RECUPERATION,
  FAUCHE_SUSPENSION,
  HAUTEUR_ENTITE,
  LOURD_SWING,
  PLONGEON_AVANT_DUREE,
  PLONGEON_PORTEE,
  RAYON_ENTITE,
  RECUPERATION_PLONGEON,
  SAUTEE_DUREE,
  SAUTEE_WINDUP,
  TOUR_DUREE,
  TOUR_IMPACT,
  UPPERCUT_IMPACT,
  WINDUP_LOURD,
  chargeEnCours,
  clamp,
  deltaAngle,
  lerp,
  palierDe,
  type ArmeId,
  type Entite,
  type EntityId,
  type Evenement,
  type World,
} from '@bougie/shared'
import { entiteMaillage, meshCapsuleJoueur } from './formes'
import { appliquerMateriau, materiau } from './materiaux'

const RAD_TO_DEG = 180 / Math.PI
/**
 * La simulation avance a 60 Hz fixes, l'ecran rafraichit plus vite : sans
 * lissage on voit les marches. Mais tout lissage est de la latence pure.
 * 60 = une constante de temps d'exactement un tick (17 ms) : assez pour effacer
 * les marches, assez peu pour ne pas se sentir.
 */
const LISSAGE_POS = 60

/**
 * Animation d'attaque, en trois temps comme dans un jeu de combat : armement,
 * frappe, retour.
 *
 * L'armement occupe le debut du delai d'impact (WINDUP_*) : c'est lui qui
 * annonce le coup, et c'est sa duree qui rend un coup lourd lent a l'oeil. La
 * frappe est courte et accelere jusqu'a l'impact : la lame arrive sur la cible
 * exactement quand la simulation applique les degats. Le retour prend son
 * temps, c'est lui qui donne du poids au geste.
 *
 * Un coup annule ne joue jamais sa frappe : la pose revient au repos depuis la
 * ou elle a ete interrompue, et y arrive a la fin du swing, quand la jauge
 * sous le reticule est pleine. Un swing visible vaut toujours un coup reel.
 */
// Rotation du pivot autour de X. Positif = lame levee, negatif = lame baissee :
// le swing est une taille descendante, de haut en arriere vers bas en avant.
const ARME_REPOS = -8
const ARME_ARMEE = 150
const ARME_FRAPPE = -55
const TORSE_ARME = 30
const TORSE_FRAPPE = -32
/** Duree de la frappe proprement dite, a la fin du delai d'impact. Tout ce qui
 *  la precede est de l'armement visible. */
const FRAPPE_NORMAL = 0.08
const FRAPPE_LOURD = 0.12

/**
 * Coup lourd : lacet de la lame, en degres, autour de l'axe VERTICAL.
 * -34 = garde, la meme direction que celle du coup normal pour qu'on passe de
 * l'un a l'autre sans saut. -125 = bras arme sur la droite, +30 = lame devant,
 * legerement a gauche. Le balayage passe donc franchement devant le personnage.
 */
const LOURD_REPOS = -34
const LOURD_ARME = -125
const LOURD_IMPACT = 30
/** Inclinaison du buste : en arriere a l'armement, jete en avant a l'impact. */
const LOURD_PENCHE_ARME = 5
const LOURD_PENCHE_IMPACT = -8

/**
 * Longue hache, enchainement facon Counter Sword : trois gestes differents.
 * Les deux balayages tournent autour de l'axe vertical (lacet de la lame) ; la
 * taille finale tourne autour de X dans le plan diagonal, comme l'epee.
 */
const HACHE_REPOS = -34
const HACHE_BALAYAGE_ARME = -115
const HACHE_BALAYAGE_IMPACT = 45
const HACHE_REVERS_ARME = 60
const HACHE_REVERS_IMPACT = -125
const HACHE_TAILLE_ARMEE = 160
const HACHE_TAILLE_IMPACT = -60
/**
 * Coup lourd a la hache : un uppercut, de la lame au ras du sol a droite a la
 * lame au-dessus de la tete a gauche, dans le plan diagonal montant.
 */
const HACHE_UPPERCUT_ARME = -100
const HACHE_UPPERCUT_IMPACT = 120
/** Tourbillon : la hache tendue sur le cote droit, le corps fait un tour complet par tour. */
const TOURBILLON_LACET = -90

/**
 * Double epee : deux lames courtes, la gauche toujours en miroir exact de la
 * droite. Tous les gestes de la Death Scythe se lisent symetriques : ciseaux,
 * toupie bras tendus, V montant, X du coup fort. Garde : un V devant soi.
 */
const DOUBLE_REPOS = -34
const DOUBLE_CISEAUX_ARME = -115
const DOUBLE_CISEAUX_IMPACT = 50
/** Coup fort : les deux lames levees derriere les epaules, abattues en X devant. */
const DOUBLE_X_ARME = 160
const DOUBLE_X_IMPACT = -60

/**
 * Marteau : balayage horizontal tres ample. La tete part loin derriere a
 * droite, balaie tout le devant et continue sur sa lancee jusqu'a revenir en
 * garde par l'arriere : un marteau lourd ne repart pas en sens inverse.
 */
const MARTEAU_REPOS = -40
const MARTEAU_ARME = -160
const MARTEAU_IMPACT = 165
const FRAPPE_MARTEAU = 0.16
/** Pivot autour de X dans le plan d'ecrasement : tete au-dessus de la tete, tete au sol devant. */
const MARTEAU_LEVE = 165
const MARTEAU_SOL = -78
/** Le marteau se leve pendant ce temps au debut d'une charge. */
const LEVEE_CHARGE = 0.3
/** Duree de l'animation de l'uppercut : les lames redescendent pendant le vol. */
const UPPERCUT_FIN = UPPERCUT_IMPACT + 0.6

/** Cote du cube qui sert de gant. */
const GANT = 0.24
/** Recul du gant pendant l'armement, en fraction de l'allonge. */
const GANT_ARME = -0.3
const GANT_ARME_LOURD = -0.45

const DUREE_ONDE = 0.38

interface Pose {
  /** Torsion du torse (lacet), en degres. */
  torsion: number
  /** Inclinaison du torse : positif = en arriere, negatif = en avant. */
  penche: number
  /** La pointe de lame trace sa trainee a cette frame. */
  trainee: boolean
}

interface StylePalier {
  couleur: pc.Color
  rayonAura: number
  hauteurColonne: number
}

/** §2 — la recompense de palier est cosmetique et statutaire. Elle est ICI, pas dans les stats. */
const STYLES_PALIER: Record<number, StylePalier> = {
  1: { couleur: new pc.Color(1, 0.78, 0.25), rayonAura: 1.5, hauteurColonne: 0 },
  2: { couleur: new pc.Color(1, 0.48, 0.12), rayonAura: 2, hauteurColonne: 14 },
  3: { couleur: new pc.Color(1, 0.25, 0.75), rayonAura: 2.6, hauteurColonne: 26 },
}

interface Vue {
  racine: pc.Entity
  torse: pc.Entity
  corps: pc.Entity
  matCorps: pc.StandardMaterial
  planLacet: pc.Entity
  planRoulis: pc.Entity
  pivotArme: pc.Entity
  arme: pc.Entity
  pointe: pc.Entity
  /** Longue hache : manche et lame, sous le meme pivot que l'epee. */
  hache: pc.Entity
  pointeHache: pc.Entity
  /** Marteau : manche et tete, sous le meme pivot. */
  marteau: pc.Entity
  pointeMarteau: pc.Entity
  /**
   * Double epee : la lame droite est celle de l'epee, raccourcie ; la gauche
   * a sa propre chaine de plans, recopiee en miroir de la droite a chaque image.
   */
  planLacetG: pc.Entity
  planRoulisG: pc.Entity
  pivotArmeG: pc.Entity
  lameG: pc.Entity
  pointeG: pc.Entity
  /** Materiau des lames, epee comme hache : c'est lui qui porte l'eclat des coups. */
  matArme: pc.StandardMaterial
  /** Les deux bras existent toujours. Seul celui qui frappe s'allonge. */
  bras: [pc.Entity, pc.Entity]
  membres: [pc.Entity, pc.Entity]
  /** Alterne a chaque coup de poing : sinon on frappe toujours du meme bras. */
  poingGauche: boolean
  /** Rang du coup de hache en cours, fige a son depart : la sim remet son
   *  enchainement a zero quand on encaisse, le geste en cours ne doit pas changer. */
  etapeCombo: number
  dernierCoupVu: number
  aura: pc.Entity
  matAura: pc.StandardMaterial
  colonne: pc.Entity
  matColonne: pc.StandardMaterial
  couleurBase: pc.Color
  local: boolean
  posRendu: pc.Vec3
  yawRendu: number
  roulisRendu: number
  /** Positions successives de la pointe de lame pendant le swing. */
  trainee: pc.Vec3[]
  /** Celle de la lame gauche de la double epee. */
  traineeG: pc.Vec3[]
  initialisee: boolean
}

interface Onde {
  x: number
  z: number
  y: number
  /** Rayon final : la portee du plongeon, ou la zone de l'ecrasement. */
  rayon: number
  debut: number
  entite: pc.Entity
  materiau: pc.StandardMaterial
}

const NB_ONDES = 4

export class Acteurs {
  private readonly app: pc.AppBase
  private readonly vues = new Map<EntityId, Vue>()
  /** Pool fixe : un impact ne doit jamais creer d'entite en plein combat. */
  private readonly ondes: Onde[] = []
  private prochaineOnde = 0
  private horloge = 0

  constructor(app: pc.AppBase) {
    this.app = app
    for (let i = 0; i < NB_ONDES; i++) {
      const materiau_ = materiau({
        diffuse: new pc.Color(0, 0, 0),
        // Discret : c'est le cercle net en peripherie qui porte l'information,
        // le disque ne fait que teinter le sol. Un aplat vif a 3.6 m de rayon
        // sous les pieds de la camera efface toute la scene.
        emissive: new pc.Color(0.55, 0.3, 0.08),
        additif: true,
        opacite: 0,
      })
      const entite = new pc.Entity(`onde-${i}`)
      entite.addComponent('render', { type: 'cylinder', castShadows: false })
      appliquerMateriau(entite, materiau_)
      entite.enabled = false
      app.root.addChild(entite)
      this.ondes.push({ x: 0, y: 0, z: 0, rayon: PLONGEON_PORTEE, debut: -99, entite, materiau: materiau_ })
    }
  }

  positionRendu(id: EntityId): pc.Vec3 | null {
    return this.vues.get(id)?.posRendu ?? null
  }

  /** Effets declenches par un evenement plutot que par un etat continu. */
  consommer(evenements: readonly Evenement[]): void {
    for (const ev of evenements) {
      // L'onde au sol montre la zone reellement frappee : celle du plongeon,
      // ou le disque de l'ecrasement du marteau, centre devant lui.
      if (ev.type === 'plongeon_impact') this.lancerOnde(ev.pos.x, ev.pos.y, ev.pos.z, PLONGEON_PORTEE)
      else if (ev.type === 'ecrasement_impact') this.lancerOnde(ev.pos.x, ev.pos.y, ev.pos.z, ev.rayon)
    }
  }

  private lancerOnde(x: number, y: number, z: number, rayon: number): void {
    const onde = this.ondes[this.prochaineOnde % NB_ONDES]!
    this.prochaineOnde++
    onde.x = x
    onde.y = y
    onde.z = z
    onde.rayon = rayon
    onde.debut = this.horloge
  }

  maj(monde: World, idLocal: EntityId, dt: number): void {
    this.horloge += dt

    for (const e of monde.entites.values()) {
      let vue = this.vues.get(e.id)
      if (!vue) {
        vue = this.creerVue(e, e.id === idLocal)
        this.vues.set(e.id, vue)
      }
      this.majVue(vue, e, monde.temps, dt)
    }

    for (const [id, vue] of this.vues) {
      if (!monde.entites.has(id)) {
        vue.racine.destroy()
        this.vues.delete(id)
      }
    }

    this.dessinerTrainees()
    this.dessinerOndes()
  }

  // --- Construction ---------------------------------------------------------

  private creerVue(e: Entite, local: boolean): Vue {
    // Bleu : soi. Rouge : ce qui frappe. Paille : le mannequin de test, qui ne frappe pas.
    const couleurBase = local
      ? new pc.Color(0.3, 0.6, 1)
      : e.espece === 'essai'
        ? new pc.Color(0.86, 0.74, 0.42)
        : new pc.Color(0.78, 0.33, 0.29)

    const racine = new pc.Entity(`acteur-${e.id}`)

    // Le torse porte toute l'animation (torsion, inclinaison). La racine ne
    // porte que ce qui vient de la simulation : position et yaw.
    const torse = new pc.Entity('torse')
    racine.addChild(torse)

    const matCorps = materiau({ diffuse: couleurBase })
    const corps = entiteMaillage('corps', meshCapsuleJoueur(this.app.graphicsDevice), matCorps)
    corps.setLocalPosition(0, HAUTEUR_ENTITE / 2, 0)
    torse.addChild(corps)

    // Nez : une capsule est symetrique, sans lui on ne lit ni l'orientation ni
    // la torsion du corps pendant une attaque.
    const nez = new pc.Entity('nez')
    nez.addComponent('render', { type: 'box', castShadows: false })
    nez.setLocalScale(0.17, 0.17, 0.3)
    nez.setLocalPosition(0, HAUTEUR_ENTITE * 0.8, -RAYON_ENTITE - 0.02)
    appliquerMateriau(
      nez,
      materiau({
        diffuse: new pc.Color(0.9, 0.92, 0.96),
        emissive: new pc.Color(0.35, 0.37, 0.42),
      }),
    )
    torse.addChild(nez)

    // Les DEUX bras, toujours presents. Un seul bras qui change de cote a
    // chaque coup donne l'impression qu'il se teleporte d'une epaule a l'autre.
    const bras: [pc.Entity, pc.Entity] = [new pc.Entity('bras-g'), new pc.Entity('bras-d')]
    const membres: [pc.Entity, pc.Entity] = [new pc.Entity('membre-g'), new pc.Entity('membre-d')]
    for (let i = 0; i < 2; i++) {
      const cote = i === 0 ? -1 : 1
      bras[i]!.setLocalPosition(RAYON_ENTITE * 1.02 * cote, HAUTEUR_ENTITE * 0.7, 0)
      const membre = membres[i]!
      membre.addComponent('render', { type: 'box' })
      appliquerMateriau(membre, matCorps)
      bras[i]!.addChild(membre)
      torse.addChild(bras[i]!)
    }

    // Plan de la taille : une diagonale qui balaie vers l'avant-droit.
    //
    // Deux rotations, dans deux entites separees pour ne dependre d'aucun ordre
    // d'angles d'Euler. Le lacet est le plus important des deux : une rotation
    // autour de Z laisse la normale du plan dans le plan horizontal, donc
    // toujours perpendiculaire a la vue, donc l'arc reste invisible. C'est le
    // lacet qui le tourne vers la camera.
    const planLacet = new pc.Entity('plan-lacet')
    planLacet.setLocalPosition(RAYON_ENTITE * 0.8, HAUTEUR_ENTITE * 0.62, 0)
    planLacet.setLocalEulerAngles(0, -34, 0)
    torse.addChild(planLacet)

    const planRoulis = new pc.Entity('plan-roulis')
    planRoulis.setLocalEulerAngles(0, 0, -45)
    planLacet.addChild(planRoulis)

    // Arme : un pivot a l'epaule, la lame devant. Rotation du pivot = swing.
    const pivotArme = new pc.Entity('pivot-arme')
    planRoulis.addChild(pivotArme)

    const arme = new pc.Entity('arme')
    arme.addComponent('render', { type: 'box' })
    const matArme = materiau({
      diffuse: new pc.Color(0.85, 0.87, 0.92),
      emissive: new pc.Color(0.1, 0.11, 0.14),
    })
    appliquerMateriau(arme, matArme)
    pivotArme.addChild(arme)

    // Entite vide a la pointe de la lame : c'est elle qu'on echantillonne
    // pour tracer la trainee du coup.
    const pointe = new pc.Entity('pointe')
    arme.addChild(pointe)

    // Longue hache : un manche long et une lame plate en bout, dans le metal
    // de l'epee pour que l'eclat des coups s'y lise pareil. Lame haute plutot
    // que tranchante dans l'axe du coup : depuis la camera, c'est la surface
    // qui se voit, pas le fil.
    const hache = new pc.Entity('hache')
    pivotArme.addChild(hache)
    const manche = new pc.Entity('manche')
    manche.addComponent('render', { type: 'box' })
    appliquerMateriau(manche, materiau({ diffuse: new pc.Color(0.45, 0.32, 0.2) }))
    manche.setLocalScale(0.07, 0.07, 1.5)
    manche.setLocalPosition(0, 0, -0.6)
    hache.addChild(manche)
    const lame = new pc.Entity('lame-hache')
    lame.addComponent('render', { type: 'box' })
    appliquerMateriau(lame, matArme)
    lame.setLocalScale(0.05, 0.42, 0.3)
    lame.setLocalPosition(0, 0.16, -1.2)
    hache.addChild(lame)
    const pointeHache = new pc.Entity('pointe-hache')
    pointeHache.setLocalPosition(0, 0.37, -1.2)
    hache.addChild(pointeHache)
    hache.enabled = false

    // Marteau : un manche et une tete massive en travers, en T. Vue de dos,
    // c'est cette barre au bout du manche qui dit « marteau » a distance, et
    // elle porte l'eclat des coups comme les lames.
    const marteau = new pc.Entity('marteau')
    pivotArme.addChild(marteau)
    const mancheMarteau = new pc.Entity('manche-marteau')
    mancheMarteau.addComponent('render', { type: 'box' })
    appliquerMateriau(mancheMarteau, materiau({ diffuse: new pc.Color(0.36, 0.25, 0.16) }))
    mancheMarteau.setLocalScale(0.08, 0.08, 1.3)
    mancheMarteau.setLocalPosition(0, 0, -0.55)
    marteau.addChild(mancheMarteau)
    const tete = new pc.Entity('tete-marteau')
    tete.addComponent('render', { type: 'box' })
    appliquerMateriau(tete, matArme)
    tete.setLocalScale(0.58, 0.34, 0.34)
    tete.setLocalPosition(0, 0, -1.2)
    marteau.addChild(tete)
    const pointeMarteau = new pc.Entity('pointe-marteau')
    pointeMarteau.setLocalPosition(0, 0, -1.25)
    marteau.addChild(pointeMarteau)
    marteau.enabled = false

    // Lame gauche de la double epee, avec sa propre chaine de plans a l'epaule
    // gauche. Elle n'est jamais animee directement : majArme la recopie en
    // miroir de la droite.
    const planLacetG = new pc.Entity('plan-lacet-g')
    torse.addChild(planLacetG)
    const planRoulisG = new pc.Entity('plan-roulis-g')
    planLacetG.addChild(planRoulisG)
    const pivotArmeG = new pc.Entity('pivot-arme-g')
    planRoulisG.addChild(pivotArmeG)
    const lameG = new pc.Entity('lame-g')
    lameG.addComponent('render', { type: 'box' })
    appliquerMateriau(lameG, matArme)
    pivotArmeG.addChild(lameG)
    const pointeG = new pc.Entity('pointe-g')
    lameG.addChild(pointeG)
    planLacetG.enabled = false

    // Aura de palier : disque au sol + colonne de lumiere.
    const aura = new pc.Entity('aura')
    aura.addComponent('render', { type: 'cylinder', castShadows: false })
    aura.setLocalPosition(0, 0.04, 0)
    const matAura = materiau({
      diffuse: new pc.Color(0, 0, 0),
      emissive: new pc.Color(1, 1, 1),
      additif: true,
      opacite: 0,
    })
    appliquerMateriau(aura, matAura)
    aura.enabled = false
    racine.addChild(aura)

    const colonne = new pc.Entity('colonne')
    colonne.addComponent('render', { type: 'cylinder', castShadows: false })
    const matColonne = materiau({
      diffuse: new pc.Color(0, 0, 0),
      emissive: new pc.Color(1, 1, 1),
      additif: true,
      opacite: 0,
    })
    appliquerMateriau(colonne, matColonne)
    colonne.enabled = false
    racine.addChild(colonne)

    this.app.root.addChild(racine)

    return {
      racine,
      torse,
      corps,
      matCorps,
      pivotArme,
      arme,
      pointe,
      hache,
      pointeHache,
      marteau,
      pointeMarteau,
      planLacetG,
      planRoulisG,
      pivotArmeG,
      lameG,
      pointeG,
      matArme,
      planLacet,
      planRoulis,
      bras,
      membres,
      poingGauche: false,
      etapeCombo: 0,
      dernierCoupVu: -99,
      aura,
      matAura,
      colonne,
      matColonne,
      couleurBase,
      local,
      posRendu: new pc.Vec3(e.pos.x, e.pos.y, e.pos.z),
      yawRendu: e.yaw,
      roulisRendu: 0,
      trainee: [],
      traineeG: [],
      initialisee: false,
    }
  }

  // --- Mise a jour ----------------------------------------------------------

  private majVue(vue: Vue, e: Entite, temps: number, dt: number): void {
    // Teleportation a l'apparition : ne jamais interpoler entre deux spawns.
    const saut = !vue.initialisee || distance(vue.posRendu, e) > 8
    if (saut) {
      vue.posRendu.set(e.pos.x, e.pos.y, e.pos.z)
      vue.yawRendu = e.yaw
      vue.initialisee = true
      vue.trainee.length = 0
      vue.traineeG.length = 0
    } else {
      const t = 1 - Math.exp(-LISSAGE_POS * dt)
      vue.posRendu.x = lerp(vue.posRendu.x, e.pos.x, t)
      vue.posRendu.y = lerp(vue.posRendu.y, e.pos.y, t)
      vue.posRendu.z = lerp(vue.posRendu.z, e.pos.z, t)
      vue.yawRendu += deltaAngle(vue.yawRendu, e.yaw) * t
    }

    vue.racine.enabled = e.vivant
    if (!e.vivant) {
      vue.trainee.length = 0
      vue.traineeG.length = 0
      return
    }

    vue.racine.setPosition(vue.posRendu)
    vue.racine.setEulerAngles(0, vue.yawRendu * RAD_TO_DEG, 0)

    const pose = this.majArme(vue, e, temps)
    this.majTorse(vue, e, temps, dt, pose.torsion, pose.penche)
    this.majCorps(vue, e, temps)
    this.majAura(vue, e, temps)
    const pointe = e.arme === 'hache' ? vue.pointeHache : e.arme === 'marteau' ? vue.pointeMarteau : vue.pointe
    majTrainee(vue.trainee, pose.trainee, pointe)
    majTrainee(vue.traineeG, pose.trainee && e.arme === 'doubleEpee', vue.pointeG)
  }

  /** Pose l'arme et les gants, et retourne ce que le torse doit en faire. */
  private majArme(vue: Vue, e: Entite, temps: number): Pose {
    const epee = e.arme === 'epee'
    const hache = e.arme === 'hache'
    const doubleEpee = e.arme === 'doubleEpee'
    const marteau = e.arme === 'marteau'
    vue.arme.enabled = epee || doubleEpee
    vue.hache.enabled = hache
    vue.marteau.enabled = marteau
    vue.planLacetG.enabled = doubleEpee
    if (epee) {
      // Lame plate et large : une tige de 8 cm qui balaie en trois images ne se
      // voit pas, une lame de 22 cm de large accroche la lumiere.
      vue.arme.setLocalScale(0.05, 0.22, 1.05)
      vue.pointe.setLocalPosition(0, 0, -0.55)
      vue.matArme.diffuse.set(0.85, 0.87, 0.94)
    } else if (doubleEpee) {
      // Deux lames plus courtes et plus etroites : la paire se distingue de
      // l'epee seule au premier coup d'oeil, meme de dos.
      vue.arme.setLocalScale(0.04, 0.15, 0.85)
      vue.pointe.setLocalPosition(0, 0, -0.55)
      vue.matArme.diffuse.set(0.85, 0.87, 0.94)
    }
    // Les poses de l'epee repositionnent la lame ; celles des autres armes non.
    vue.arme.setLocalPosition(0, 0, doubleEpee ? -0.43 : -0.52)

    if (vue.dernierCoupVu !== e.dernierCoupA) {
      vue.dernierCoupVu = e.dernierCoupA
      vue.poingGauche = !vue.poingGauche
      vue.etapeCombo = Math.max(0, e.comboEtape)
    }

    // Les deux gants reviennent d'abord en garde ; les poses qui suivent ne
    // touchent qu'a ce qu'elles animent vraiment.
    this.gantsAuRepos(vue, temps)
    // Arme en main, pas de gants du tout : la lame porte toute l'animation.
    vue.membres[0]!.enabled = e.arme === 'poings'
    vue.membres[1]!.enabled = e.arme === 'poings'

    // L'armement n'existe plus comme etat separe : le coup lourd est lance des
    // que le maintien est reconnu, et son propre swing sert de telegraphe.
    const enLourd = temps - e.dernierLourdA < LOURD_SWING

    // Le coup lourd passe AVANT la recuperation : lui aussi met le personnage
    // en recuperation, et sans cet ordre son animation etait immediatement
    // ecrasee par la pose « epee plantee » du plongeon.
    // La pose de plongeon est en plus conditionnee a un vrai plongeon recent,
    // pas a une recuperation quelconque.
    const recuperationPlongeon = temps - e.dernierPlongeonA < RECUPERATION_PLONGEON
    // Un tour, ou le retour en garde qui suit le dernier.
    const enTourbillon = e.dernierCoupA === e.dernierTourA && temps < e.finSwing

    // Les coups speciaux de la double epee et du marteau : chacun tant que son
    // animation dure. Le fauchage court jusqu'a la fin de la recuperation qui
    // suit l'atterrissage, dont la date n'est connue qu'au sol.
    const dernier = e.typeDernierCoup
    const ecoule = temps - e.dernierCoupA
    const enUppercut = dernier === 'uppercut' && ecoule < UPPERCUT_FIN
    const enFauche = dernier === 'fauche' && (e.chuteLibre || temps < e.finRecuperation)
    const enSautee = dernier === 'sautee' && ecoule < SAUTEE_DUREE
    const enEcrasement = dernier === 'ecrasement' && temps < e.finSwing

    let resultat: Pose
    if (e.ruee === 'course') {
      resultat = poseRuee(vue)
    } else if (e.chargeDepuis >= 0) {
      resultat = this.poseCharge(vue, e, temps)
    } else if (enLourd) {
      resultat = this.poseLourd(vue, e, temps, e.arme)
    } else if (e.plongeon !== 'aucun' || recuperationPlongeon) {
      resultat = this.poseplongeon(vue, e, temps)
    } else if (enTourbillon) {
      resultat = this.poseTourbillon(vue, e, temps)
    } else if (enUppercut) {
      resultat = this.poseUppercut(vue, e, temps)
    } else if (enFauche) {
      resultat = this.poseFauche(vue, e, temps)
    } else if (enEcrasement) {
      resultat = this.poseEcrasement(vue, e, temps)
    } else if (enSautee) {
      resultat = this.poseSautee(vue, e, temps)
    } else if (epee) {
      resultat = this.poseEpee(vue, e, temps)
    } else if (hache) {
      resultat = this.poseHache(vue, e, temps)
    } else if (doubleEpee) {
      resultat = this.poseDoubleEpee(vue, e, temps)
    } else if (marteau) {
      resultat = this.poseMarteau(vue, e, temps)
    } else {
      resultat = this.posePoing(vue, e, temps)
    }

    // La lame gauche suit la droite en miroir du plan median du corps. Toute la
    // chaine est recopiee — plans, pivot, lame — pour que le miroir reste exact
    // quelle que soit la pose.
    if (doubleEpee) {
      miroir(vue.planLacet, vue.planLacetG)
      miroir(vue.planRoulis, vue.planRoulisG)
      miroir(vue.pivotArme, vue.pivotArmeG)
      miroir(vue.arme, vue.lameG)
      vue.lameG.setLocalScale(vue.arme.getLocalScale())
      vue.pointeG.setLocalPosition(vue.pointe.getLocalPosition())
    }

    vue.matArme.update()
    return resultat
  }

  /**
   * Position de garde des deux gants.
   *
   * Ce sont deux petits cubes qui vont et viennent, pas des membres qui
   * s'etirent : un bras qui s'allonge donne un rendu de bloc Minecraft, alors
   * qu'un gant qui avance et revient lit comme un coup de poing.
   */
  private gantsAuRepos(vue: Vue, temps: number): void {
    // Leger balancement de garde : sans lui, deux cubes immobiles a cote du
    // corps ressemblent a des accessoires, pas a des mains.
    const bob = Math.sin(temps * 2.6) * 0.02
    for (let i = 0; i < 2; i++) {
      const cote = i === 0 ? -1 : 1
      // Nettement au-dela du rayon de la capsule : a l'interieur, les gants
      // sont simplement invisibles depuis la camera 3e personne.
      vue.bras[i]!.setLocalPosition(RAYON_ENTITE * 1.3 * cote, HAUTEUR_ENTITE * 0.68, 0)
      vue.bras[i]!.setLocalEulerAngles(0, 0, 0)
      vue.membres[i]!.setLocalScale(GANT, GANT, GANT)
      vue.membres[i]!.setLocalPosition(cote * -0.04, bob * cote, -0.26 + bob)
    }
  }

  /**
   * Projette un gant DROIT DEVANT. `ext` va de 0 (garde) a 1 (bras tendu) ;
   * negatif, le gant recule vers l'epaule pour s'armer.
   * Aucune derive laterale : le coup part vers le reticule, pas en diagonale.
   */
  private lancerGant(vue: Vue, gauche: boolean, ext: number, allonge: number): void {
    const i = gauche ? 0 : 1
    const grossi = GANT * (1 + 0.15 * Math.max(0, ext))
    vue.membres[i]!.setLocalPosition(0, 0, -0.26 - allonge * ext)
    vue.membres[i]!.setLocalScale(grossi, grossi, GANT)
  }

  /**
   * Epee : taille descendante dans un plan diagonal.
   * Un balayage purement vertical se fait dans le plan sagittal, celui que la
   * camera regarde par la tranche — il y est invisible quelle que soit son
   * ampleur. Le lacet du plan est ce qui le tourne vers l'objectif.
   */
  private poseEpee(vue: Vue, e: Entite, temps: number): Pose {
    planDiagonal(vue)
    vue.arme.setLocalPosition(0, 0, -0.52)

    // Armement : la lame monte au-dessus de l'epaule. Frappe : elle balaie
    // 205 deg en accelerant jusqu'a l'impact. Retour : lent, c'est lui qui
    // donne son poids au coup.
    const c = coupNormal(e, temps, 0)
    vue.pivotArme.setLocalEulerAngles(c.val(ARME_REPOS, ARME_ARMEE, ARME_FRAPPE), 0, 0)
    // L'eclat culmine a l'impact, pas au depart du geste.
    vue.matArme.emissive.set(c.eclat * 0.9, c.eclat * 0.95, c.eclat)
    return { torsion: c.val(0, TORSE_ARME, TORSE_FRAPPE), penche: 0, trainee: traineeSur(c) }
  }

  /**
   * Poings : un coup droit, pas une taille. Le gant recule pour s'armer, puis
   * part DEVANT, en ligne droite. Les deux poings alternent.
   */
  private posePoing(vue: Vue, e: Entite, temps: number): Pose {
    // Plans neutres : un coup droit n'a pas de plan de balayage.
    vue.planRoulis.setLocalEulerAngles(0, 0, 0)
    vue.planLacet.setLocalEulerAngles(0, 0, 0)
    vue.pivotArme.setLocalEulerAngles(0, 0, 0)

    const c = coupNormal(e, temps, 0)
    this.lancerGant(vue, vue.poingGauche, c.val(0, GANT_ARME, 1), 0.66)
    // Aucune torsion du buste : elle ferait pivoter la trajectoire du gant et
    // le coup partirait en diagonale au lieu de partir droit devant.
    return { torsion: 0, penche: 0, trainee: false }
  }

  /**
   * Longue hache, enchainement facon Counter Sword : balayage de droite a
   * gauche, revers de gauche a droite, puis taille verticale par-dessus la
   * tete, qui projette. Chaque geste frappe deux fois : la lame marque un
   * temps a mi-course. Le geste est celui du rang fige au depart du coup.
   */
  private poseHache(vue: Vue, e: Entite, temps: number): Pose {
    const c = coupNormal(e, temps, vue.etapeCombo)
    vue.matArme.emissive.set(c.eclat * 0.9, c.eclat * 0.95, c.eclat)

    if (vue.etapeCombo < 2) {
      planHorizontal(vue)
      const aller = vue.etapeCombo === 0
      const lacet = aller
        ? c.val(HACHE_REPOS, HACHE_BALAYAGE_ARME, HACHE_BALAYAGE_IMPACT)
        : c.val(HACHE_REPOS, HACHE_REVERS_ARME, HACHE_REVERS_IMPACT)
      vue.pivotArme.setLocalEulerAngles(0, lacet, 0)
      const torsion = aller ? c.val(0, 25, -30) : c.val(0, -25, 30)
      return { torsion, penche: 0, trainee: traineeSur(c) }
    }

    // La taille finale passe dans le plan diagonal de l'epee : verticale, elle
    // serait vue par la tranche depuis la camera.
    planDiagonal(vue)
    vue.pivotArme.setLocalEulerAngles(c.val(ARME_REPOS, HACHE_TAILLE_ARMEE, HACHE_TAILLE_IMPACT), 0, 0)
    return { torsion: c.val(0, 20, -20), penche: c.val(0, 6, -14), trainee: traineeSur(c) }
  }

  /**
   * Double epee, les trois gestes de la Death Scythe, toujours symetriques (la
   * lame gauche recopie la droite en miroir) : des ciseaux qui se croisent
   * devant, une toupie bras tendus qui frappe deux fois tout autour, puis la
   * ruee et un V qui remonte — celui qui fait trebucher.
   */
  private poseDoubleEpee(vue: Vue, e: Entite, temps: number): Pose {
    const c = coupNormal(e, temps, vue.etapeCombo)
    vue.matArme.emissive.set(c.eclat * 0.9, c.eclat * 0.95, c.eclat)

    if (vue.etapeCombo === 0) {
      planHorizontal(vue)
      vue.pivotArme.setLocalEulerAngles(0, c.val(DOUBLE_REPOS, DOUBLE_CISEAUX_ARME, DOUBLE_CISEAUX_IMPACT), 0)
      return { torsion: 0, penche: c.val(0, 3, -6), trainee: traineeSur(c) }
    }

    if (vue.etapeCombo === 1) {
      // Toupie : un tour complet, la moitie au premier coup, le reste au
      // second. Au retour le corps fait deja face a l'avant (-360 = 0) : il ne
      // doit surtout pas se derouler dans l'autre sens.
      planHorizontal(vue)
      vue.pivotArme.setLocalEulerAngles(0, c.val(DOUBLE_REPOS, -90, -90), 0)
      const tour = c.phase === 'retour' || c.phase === 'repos' ? 0 : c.val(0, 25, -360)
      return { torsion: tour, penche: -4, trainee: traineeSur(c) }
    }

    // Ruee et coup montant, dans le plan diagonal montant : dans celui de la
    // taille, « en bas » passe derriere la capsule.
    planDiagonalMontant(vue)
    vue.pivotArme.setLocalEulerAngles(c.val(ARME_REPOS, -100, 130), 0, 0)
    return { torsion: 0, penche: c.val(0, -16, 8), trainee: traineeSur(c) }
  }

  /**
   * Marteau, le balayage du Breaker : la tete part loin derriere a droite
   * pendant un long armement, balaie tout le devant — le buste suit —, puis
   * continue sur sa lancee et revient en garde par l'arriere.
   */
  private poseMarteau(vue: Vue, e: Entite, temps: number): Pose {
    planHorizontal(vue)
    const c = coupNormal(e, temps, 0)
    // Au retour, on continue a tourner jusqu'a la garde plus un tour, au lieu
    // de revenir sur ses pas.
    const lacet =
      c.phase === 'retour'
        ? lerp(MARTEAU_IMPACT, MARTEAU_REPOS + 360, c.k)
        : c.val(MARTEAU_REPOS, MARTEAU_ARME, MARTEAU_IMPACT)
    vue.pivotArme.setLocalEulerAngles(0, lacet, 0)
    vue.matArme.emissive.set(c.eclat * 0.9, c.eclat * 0.8, c.eclat * 0.6)
    return { torsion: c.val(0, 35, -40), penche: c.val(0, 6, -8), trainee: traineeSur(c) }
  }

  /**
   * Uppercut de la double epee : accroupi, lames basses, puis tout remonte d'un
   * coup — les lames en V au-dessus de la tete, le corps qui decolle avec. Elles
   * redescendent en garde pendant le vol.
   */
  private poseUppercut(vue: Vue, e: Entite, temps: number): Pose {
    planDiagonalMontant(vue)
    const t = temps - e.dernierCoupA
    const annuleA = annulationDe(e, e.dernierCoupA)
    const fin = e.finSwing - e.dernierCoupA
    const debutFrappe = UPPERCUT_IMPACT - 0.1
    const lames = lireClesAnnulables(
      t,
      [
        { t: 0, v: ARME_REPOS },
        { t: debutFrappe, v: -100 },
        { t: UPPERCUT_IMPACT, v: 140, accel: true },
        { t: UPPERCUT_FIN, v: ARME_REPOS },
      ],
      annuleA,
      fin,
      ARME_REPOS,
    )
    const penche = lireClesAnnulables(
      t,
      [
        { t: 0, v: 0 },
        { t: debutFrappe, v: -14 },
        { t: UPPERCUT_IMPACT, v: 10, accel: true },
        { t: UPPERCUT_FIN, v: 0 },
      ],
      annuleA,
      fin,
      0,
    )
    vue.pivotArme.setLocalEulerAngles(lames, 0, 0)
    const porte = annuleA === null || t < annuleA
    const eclat = porte ? eclatImpact(t, UPPERCUT_IMPACT, 0.1) : 0
    vue.matArme.emissive.set(eclat * 0.9, eclat * 0.95, eclat)
    return { torsion: 0, penche, trainee: porte && t >= debutFrappe && t < UPPERCUT_IMPACT + 0.12 }
  }

  /**
   * Fauchage aerien : suspendu, bras tendus, le corps s'arme sur la droite puis
   * balaie tout l'avant d'un large arc, et finit son tour en retombant — sans
   * pouvoir rien y faire. Au sol, il se releve pendant la recuperation.
   */
  private poseFauche(vue: Vue, e: Entite, temps: number): Pose {
    planHorizontal(vue)
    if (!e.chuteLibre) {
      const p = lisse(clamp(1 - (e.finRecuperation - temps) / FAUCHE_RECUPERATION, 0, 1))
      vue.pivotArme.setLocalEulerAngles(0, lerp(-90, DOUBLE_REPOS, p), 0)
      vue.matArme.emissive.set(0, 0, 0)
      return { torsion: 0, penche: lerp(-24, 0, p), trainee: false }
    }

    const t = temps - e.dernierCoupA
    const annuleA = annulationDe(e, e.dernierCoupA)
    const debutFrappe = FAUCHE_SUSPENSION - 0.12
    const fin = FAUCHE_SUSPENSION + 0.35
    const lacet = lireClesAnnulables(t, [{ t: 0, v: DOUBLE_REPOS }, { t: 0.12, v: -90 }], annuleA, fin, DOUBLE_REPOS)
    const torsion = lireClesAnnulables(
      t,
      [
        { t: 0, v: 0 },
        { t: debutFrappe, v: 80 },
        { t: FAUCHE_SUSPENSION, v: -170, accel: true },
        { t: fin, v: -360 },
      ],
      annuleA,
      fin,
      0,
    )
    const penche = lireClesAnnulables(
      t,
      [
        { t: 0, v: 0 },
        { t: FAUCHE_SUSPENSION, v: -8 },
        { t: fin, v: -14 },
      ],
      annuleA,
      fin,
      0,
    )
    vue.pivotArme.setLocalEulerAngles(0, lacet, 0)
    const porte = annuleA === null || t < annuleA
    const eclat = porte ? eclatImpact(t, FAUCHE_SUSPENSION, 0.12) : 0
    vue.matArme.emissive.set(eclat * 0.9, eclat * 0.95, eclat)
    return { torsion, penche, trainee: porte && t >= debutFrappe && t < FAUCHE_SUSPENSION + 0.1 }
  }

  /**
   * Charge du marteau : il monte au-dessus de la tete et s'y tient, de plus en
   * plus brulant. C'est le telegraphe du coup, et il dure tant qu'on tient : a
   * pleine charge, la tete palpite et tremble.
   */
  private poseCharge(vue: Vue, e: Entite, temps: number): Pose {
    planEcrasement(vue)
    const niveau = chargeEnCours(e, temps) ?? 0
    const levee = lisse(clamp((temps - e.chargeDepuis) / LEVEE_CHARGE, 0, 1))
    const tremble = Math.sin(temps * 38) * 3 * niveau
    vue.pivotArme.setLocalEulerAngles(lerp(ARME_REPOS, MARTEAU_LEVE, levee) + tremble, 0, 0)
    const palpite = niveau >= 1 ? 0.25 * Math.sin(temps * 14) : 0
    const eclat = 0.15 + 0.7 * niveau + palpite
    vue.matArme.emissive.set(eclat, eclat * 0.55, eclat * 0.2)
    return { torsion: 12 * levee, penche: 8 * levee, trainee: false }
  }

  /**
   * Ecrasement : depuis la ou la charge l'a laisse, le marteau finit de monter,
   * s'abat au sol devant et y reste un instant avant la garde.
   */
  private poseEcrasement(vue: Vue, e: Entite, temps: number): Pose {
    planEcrasement(vue)
    const t = temps - e.dernierCoupA
    const fin = e.finSwing - e.dernierCoupA
    const annuleA = annulationDe(e, e.dernierCoupA)
    // La hauteur atteinte pendant la charge : une charge breve n'a pas eu le
    // temps de lever le marteau, il finit de monter ici.
    const leveeDepart = lisse(clamp((e.niveauCharge * CHARGE_DUREE) / LEVEE_CHARGE, 0, 1))
    const debutFrappe = ECRASEMENT_WINDUP - 0.12
    const auSol = ECRASEMENT_WINDUP + 0.12
    const tete = lireClesAnnulables(
      t,
      [
        { t: 0, v: lerp(ARME_REPOS, MARTEAU_LEVE, leveeDepart) },
        { t: debutFrappe, v: MARTEAU_LEVE + 8 },
        { t: ECRASEMENT_WINDUP, v: MARTEAU_SOL, accel: true },
        { t: auSol, v: MARTEAU_SOL },
        { t: fin, v: ARME_REPOS },
      ],
      annuleA,
      fin,
      ARME_REPOS,
    )
    const penche = lireClesAnnulables(
      t,
      [
        { t: 0, v: 8 * leveeDepart },
        { t: debutFrappe, v: 10 },
        { t: ECRASEMENT_WINDUP, v: -24, accel: true },
        { t: auSol, v: -24 },
        { t: fin, v: 0 },
      ],
      annuleA,
      fin,
      0,
    )
    vue.pivotArme.setLocalEulerAngles(tete, 0, 0)
    const porte = annuleA === null || t < annuleA
    const lueur = t < ECRASEMENT_WINDUP ? 0.15 + 0.7 * e.niveauCharge : 0
    const eclat = porte ? Math.max(lueur, eclatImpact(t, ECRASEMENT_WINDUP, 0.12)) : 0
    vue.matArme.emissive.set(eclat, eclat * 0.55, eclat * 0.2)
    return { torsion: 0, penche, trainee: porte && t >= debutFrappe && t < ECRASEMENT_WINDUP + 0.05 }
  }

  /** Frappe sautee du marteau : leve au-dessus de la tete et abattu devant, en l'air. */
  private poseSautee(vue: Vue, e: Entite, temps: number): Pose {
    planEcrasement(vue)
    const t = temps - e.dernierCoupA
    const annuleA = annulationDe(e, e.dernierCoupA)
    const debutFrappe = SAUTEE_WINDUP - 0.1
    const tete = lireClesAnnulables(
      t,
      [
        { t: 0, v: ARME_REPOS },
        { t: debutFrappe, v: MARTEAU_LEVE + 5 },
        { t: SAUTEE_WINDUP, v: MARTEAU_SOL + 5, accel: true },
        { t: SAUTEE_DUREE, v: ARME_REPOS },
      ],
      annuleA,
      SAUTEE_DUREE,
      ARME_REPOS,
    )
    const penche = lireClesAnnulables(
      t,
      [
        { t: 0, v: 0 },
        { t: debutFrappe, v: 10 },
        { t: SAUTEE_WINDUP, v: -20, accel: true },
        { t: SAUTEE_DUREE, v: 0 },
      ],
      annuleA,
      SAUTEE_DUREE,
      0,
    )
    vue.pivotArme.setLocalEulerAngles(tete, 0, 0)
    const porte = annuleA === null || t < annuleA
    const eclat = porte ? eclatImpact(t, SAUTEE_WINDUP, 0.1) : 0
    vue.matArme.emissive.set(eclat * 0.9, eclat * 0.8, eclat * 0.6)
    return { torsion: 0, penche, trainee: porte && t >= debutFrappe && t < SAUTEE_WINDUP + 0.05 }
  }

  /**
   * Coup lourd : un geste large et lent, bien plus ample que le coup normal.
   * Son long armement est le seul vrai telegraphe du corps a corps : la lame
   * part loin et s'embrase jusqu'a la frappe.
   */
  private poseLourd(vue: Vue, e: Entite, temps: number, arme: ArmeId): Pose {
    const c = coupLourd(e, temps)
    const penche = c.val(0, LOURD_PENCHE_ARME, LOURD_PENCHE_IMPACT)

    if (arme === 'poings') {
      this.lancerGant(vue, false, c.val(0, GANT_ARME_LOURD, 1), 0.82)
      return { torsion: 0, penche, trainee: false }
    }

    const eclat =
      c.phase === 'armement'
        ? 0.5 * c.k
        : c.phase === 'frappe'
          ? 0.5 + 0.5 * c.k
          : c.phase === 'retour'
            ? Math.max(0, 1 - c.k * 3)
            : 0
    vue.matArme.emissive.set(eclat, eclat * 0.9, eclat * 0.6)

    if (arme === 'doubleEpee') {
      // Coup fort de la Death Scythe : les deux lames s'abattent en X devant.
      // Pris dans le dos, elles remontent a travers la cible pour le second
      // coup, en accelerant jusqu'a lui.
      planDiagonal(vue)
      const t = temps - e.dernierLourdA
      if (e.coupDosA >= e.dernierLourdA && t >= WINDUP_LOURD) {
        const annuleA = annulationDe(e, e.dernierLourdA)
        const impact2 = WINDUP_LOURD + COUP_DOS_DELAI
        const lames = lireClesAnnulables(
          t,
          [
            { t: WINDUP_LOURD, v: DOUBLE_X_IMPACT },
            { t: impact2, v: 120, accel: true },
            { t: LOURD_SWING, v: ARME_REPOS },
          ],
          annuleA,
          LOURD_SWING,
          ARME_REPOS,
        )
        const penche2 = lireClesAnnulables(
          t,
          [
            { t: WINDUP_LOURD, v: LOURD_PENCHE_IMPACT },
            { t: impact2, v: 6, accel: true },
            { t: LOURD_SWING, v: 0 },
          ],
          annuleA,
          LOURD_SWING,
          0,
        )
        vue.pivotArme.setLocalEulerAngles(lames, 0, 0)
        const porte = annuleA === null || t < annuleA
        const eclat2 = porte ? Math.max(eclatImpact(t, WINDUP_LOURD, FRAPPE_LOURD), eclatImpact(t, impact2, 0.12)) : 0
        vue.matArme.emissive.set(eclat2, eclat2 * 0.5, eclat2 * 0.9)
        return { torsion: 0, penche: penche2, trainee: porte && t < impact2 + 0.1 }
      }
      vue.pivotArme.setLocalEulerAngles(c.val(ARME_REPOS, DOUBLE_X_ARME, DOUBLE_X_IMPACT), 0, 0)
      return { torsion: 0, penche, trainee: traineeSur(c) }
    }

    if (arme === 'hache') {
      // Uppercut facon Counter Sword : la lame part du ras du sol et remonte
      // devant jusqu'au-dessus de la tete. Accroupi a l'armement, le buste se
      // redresse avec le coup.
      planDiagonalMontant(vue)
      vue.pivotArme.setLocalEulerAngles(c.val(ARME_REPOS, HACHE_UPPERCUT_ARME, HACHE_UPPERCUT_IMPACT), 0, 0)
      return { torsion: c.val(0, 20, -20), penche: c.val(0, -10, 10), trainee: traineeSur(c) }
    }

    // Balayage HORIZONTAL, autour de l'axe vertical : la lame part de la
    // droite et finit DEVANT. Le coup precedent tournait autour de l'axe
    // lateral et terminait pointe au sol, ce qui ne ressemblait pas a un coup
    // porte devant soi.
    planHorizontal(vue)
    vue.arme.setLocalPosition(0, 0, -0.52)
    vue.pivotArme.setLocalEulerAngles(0, c.val(LOURD_REPOS, LOURD_ARME, LOURD_IMPACT), 0)
    return { torsion: c.val(0, 34, -38), penche, trainee: traineeSur(c) }
  }

  /**
   * Tourbillon : la hache tendue sur le cote, le corps fait un tour complet par
   * tour, a vitesse constante pour que les tours s'enchainent sans a-coup.
   * Apres le dernier, la hache revient en garde pour la fin de la jauge.
   */
  private poseTourbillon(vue: Vue, e: Entite, temps: number): Pose {
    planHorizontal(vue)
    const ecoule = temps - e.dernierTourA
    const duree = e.finSwing - e.dernierTourA
    const annuleA = annulationDe(e, e.dernierTourA)

    // Angle du corps et lacet de la hache a un instant du tour.
    const pose = (t: number): { tour: number; lacet: number } => {
      if (t < TOUR_DUREE) return { tour: (-360 * t) / TOUR_DUREE, lacet: TOURBILLON_LACET }
      const p = lisse(clamp((t - TOUR_DUREE) / (duree - TOUR_DUREE), 0, 1))
      return { tour: 0, lacet: lerp(TOURBILLON_LACET, HACHE_REPOS, p) }
    }

    let tour: number
    let lacet: number
    let trainee = false
    if (annuleA !== null && ecoule >= annuleA) {
      // Coup encaisse avant l'impact : le tour s'arrete net et revient en garde.
      const fige = pose(annuleA)
      const p = lisse(clamp((ecoule - annuleA) / (duree - annuleA), 0, 1))
      tour = lerp(fige.tour, 0, p)
      lacet = lerp(fige.lacet, HACHE_REPOS, p)
      vue.matArme.emissive.set(0, 0, 0)
    } else {
      const courant = pose(ecoule)
      tour = courant.tour
      lacet = courant.lacet
      trainee = ecoule < TOUR_DUREE
      // Deux eclats par tour, un par impact.
      const pic = (t: number) => Math.max(0, 1 - Math.abs(ecoule - t) / 0.07)
      const eclat = Math.max(pic(TOUR_IMPACT), pic(TOUR_IMPACT + DELAI_DOUBLE_COUP))
      vue.matArme.emissive.set(eclat * 0.9, eclat * 0.95, eclat)
    }

    vue.pivotArme.setLocalEulerAngles(0, lacet, 0)
    return { torsion: tour, penche: -4, trainee }
  }

  /** Plongeon : lame haute, puis pointee vers le bas, puis plantee dans le sol. */
  private poseplongeon(vue: Vue, e: Entite, temps: number): Pose {
    // Plans neutres : la lame doit etre franchement verticale, pas en diagonale.
    vue.planLacet.setLocalEulerAngles(0, 0, 0)
    vue.planRoulis.setLocalEulerAngles(0, 0, 0)
    vue.arme.setLocalPosition(0, 0, -0.52)

    // Convention de `penche` : positif = le buste part en arriere, negatif = en avant.
    if (e.plongeon === 'suspension') {
      vue.planLacet.setLocalPosition(RAYON_ENTITE * 0.5, HAUTEUR_ENTITE * 0.62, 0)
      vue.pivotArme.setLocalEulerAngles(95, 0, 0) // lame droite au-dessus de la tete
      vue.matArme.emissive.set(0.9, 0.9, 1)
      return { torsion: 0, penche: 12, trainee: false }
    }

    if (e.plongeon === 'chute') {
      vue.planLacet.setLocalPosition(0.42, HAUTEUR_ENTITE * 0.62, -0.35)
      vue.matArme.emissive.set(0.9, 0.9, 1)
      if (ARMES[e.arme].enLAir === 'plongeonAvant') {
        // Plongeon en avant : le corps se jette sur la cible, la hache s'abat du
        // dessus de la tete jusqu'au sol devant, en accelerant jusqu'a l'impact.
        const p = clamp((temps - e.finSuspension) / PLONGEON_AVANT_DUREE, 0, 1)
        vue.pivotArme.setLocalEulerAngles(lerp(95, -80, p * p), 0, 0)
        return { torsion: 0, penche: lerp(4, -32, p), trainee: true }
      }
      vue.pivotArme.setLocalEulerAngles(-90, 0, 0) // pointe vers le bas
      return { torsion: 0, penche: -16, trainee: false }
    }

    // Recuperation : l'epee reste plantee dans le sol devant, le corps penche
    // dessus et se redresse lentement. C'est cette pose qui rend la
    // recuperation lisible de l'exterieur — on voit qu'il ne peut rien faire.
    // Le bras est ecarte pour que la lame ne disparaisse pas derriere le corps.
    const p = clamp(1 - (e.finRecuperation - temps) / RECUPERATION_PLONGEON, 0, 1)
    vue.planLacet.setLocalPosition(0.48, 1.04, -0.42)
    vue.pivotArme.setLocalEulerAngles(-90, 0, 0)
    const lueur = 1 - p
    vue.matArme.emissive.set(lueur * 0.7, lueur * 0.6, lueur * 0.35)
    return { torsion: 0, penche: lerp(-30, -5, p * p), trainee: false }
  }

  private majTorse(
    vue: Vue,
    e: Entite,
    temps: number,
    dt: number,
    torsion: number,
    penche: number,
  ): void {
    // Inclinaison dans l'esquive : sur des capsules identiques, c'est le seul
    // signal qui dit a l'adversaire qu'il vient de se faire distancer.
    const esquive = temps < e.finEsquive ? 1 - (e.finEsquive - temps) / DUREE_ESQUIVE : 0
    let cibleRoulis = esquive > 0 ? -e.directionEsquive * 16 * Math.sin(Math.PI * esquive) : 0

    // Etourdi : le corps titube. Doit se lire de loin, c'est l'information qui
    // dit aux autres que la cible est ouverte.
    if (temps < e.stunJusqua) cibleRoulis += Math.sin(temps * 21) * 11

    vue.roulisRendu += (cibleRoulis - vue.roulisRendu) * (1 - Math.exp(-18 * dt))
    vue.torse.setLocalEulerAngles(penche, torsion, vue.roulisRendu)
  }

  private majCorps(vue: Vue, e: Entite, temps: number): void {
    const depuisDegats = temps - e.dernierDegatSubiA
    const flash = depuisDegats >= 0 && depuisDegats < 0.16 ? 1 - depuisDegats / 0.16 : 0
    const etourdi = temps < e.stunJusqua ? 1 : 0

    vue.matCorps.diffuse.set(
      lerp(vue.couleurBase.r, 1, flash),
      lerp(vue.couleurBase.g, 0.25, flash),
      lerp(vue.couleurBase.b, 0.25, flash),
    )
    vue.matCorps.emissive.set(
      flash * 0.8 + etourdi * 0.35,
      flash * 0.1 + etourdi * 0.3,
      flash * 0.1,
    )

    // Ecrasement leger a l'impact : lisible meme du coin de l'oeil.
    vue.corps.setLocalScale(1 + flash * 0.1, 1 - flash * 0.12, 1 + flash * 0.1)
    vue.matCorps.update()
  }

  private majAura(vue: Vue, e: Entite, temps: number): void {
    const palier = palierDe(e.serie)
    if (!palier) {
      vue.aura.enabled = false
      vue.colonne.enabled = false
      return
    }

    const style = STYLES_PALIER[palier.rang]!
    const pulsation = 0.75 + 0.25 * Math.sin(temps * 3.4 + e.id)

    // Sa propre aura ne doit jamais gener le porteur : il connait son palier
    // par le HUD. L'aura est une information pour LES AUTRES (§2, §3 P2).
    const attenuation = vue.local ? 0.3 : 1

    vue.aura.enabled = true
    vue.aura.setLocalScale(style.rayonAura * 2, 0.02, style.rayonAura * 2)
    vue.matAura.emissive.copy(style.couleur)
    vue.matAura.opacity = 0.2 * pulsation * attenuation
    vue.matAura.update()

    // §5 — la colonne existe pour percer les murs le jour ou il y en aura.
    if (style.hauteurColonne > 0 && !vue.local) {
      vue.colonne.enabled = true
      const r = style.rayonAura * 0.16
      vue.colonne.setLocalScale(r * 2, style.hauteurColonne, r * 2)
      vue.colonne.setLocalPosition(0, style.hauteurColonne / 2, 0)
      vue.matColonne.emissive.copy(style.couleur)
      vue.matColonne.opacity = 0.09 * pulsation
      vue.matColonne.update()
    } else {
      vue.colonne.enabled = false
    }
  }

  // --- Effets en mode immediat ----------------------------------------------

  private dessinerTrainees(): void {
    for (const vue of this.vues.values()) {
      for (const t of [vue.trainee, vue.traineeG]) {
        if (t.length < 2) continue
        const points: pc.Vec3[] = []
        const couleurs: pc.Color[] = []
        for (let i = 1; i < t.length; i++) {
          const a = i / t.length
          points.push(t[i - 1]!, t[i]!)
          couleurs.push(new pc.Color(1, 1, 1, a * 0.5), new pc.Color(1, 1, 1, a * 0.75))
        }
        this.app.drawLines(points, couleurs)
      }
    }
  }

  /**
   * Onde de choc au sol : un disque plat qui s'ouvre et s'efface, plus un
   * cercle net a sa peripherie. Un simple trace de lignes d'un pixel existe
   * mais ne se voit pas — c'est la surface qui porte l'information.
   */
  private dessinerOndes(): void {
    for (const o of this.ondes) {
      const age = (this.horloge - o.debut) / DUREE_ONDE
      if (age < 0 || age >= 1) {
        o.entite.enabled = false
        continue
      }

      const rayon = 0.5 + (o.rayon - 0.5) * (1 - (1 - age) ** 2)
      const alpha = (1 - age) ** 1.6

      o.entite.enabled = true
      o.entite.setPosition(o.x, o.y + 0.05, o.z)
      o.entite.setLocalScale(rayon * 2, 0.02, rayon * 2)
      o.materiau.opacity = alpha * 0.15
      o.materiau.update()

      const couleur = new pc.Color(1, 0.88, 0.5, alpha)
      const points: pc.Vec3[] = []
      const couleurs: pc.Color[] = []
      const segments = 44
      for (let s = 0; s < segments; s++) {
        const a0 = (s / segments) * Math.PI * 2
        const a1 = ((s + 1) / segments) * Math.PI * 2
        points.push(
          new pc.Vec3(o.x + Math.cos(a0) * rayon, o.y + 0.07, o.z + Math.sin(a0) * rayon),
          new pc.Vec3(o.x + Math.cos(a1) * rayon, o.y + 0.07, o.z + Math.sin(a1) * rayon),
        )
        couleurs.push(couleur, couleur)
      }
      this.app.drawLines(points, couleurs)
    }
  }
}

/**
 * Plan de la taille : une diagonale qui balaie vers l'avant-droit. Un plan qui
 * contient l'axe avant est vu par la tranche depuis la camera : c'est le lacet
 * qui le tourne vers elle.
 */
function planDiagonal(vue: Vue): void {
  vue.planLacet.setLocalPosition(RAYON_ENTITE * 0.8, HAUTEUR_ENTITE * 0.62, 0)
  vue.planLacet.setLocalEulerAngles(0, -34, 0)
  vue.planRoulis.setLocalEulerAngles(0, 0, -45)
}

/**
 * Miroir du plan de la taille, pour les coups qui montent. Dans le plan de la
 * taille, « en bas » veut dire en bas a gauche : la lame y passe derriere la
 * capsule, invisible depuis la camera. Ici, en bas veut dire en bas a droite.
 */
function planDiagonalMontant(vue: Vue): void {
  vue.planLacet.setLocalPosition(RAYON_ENTITE * 0.8, HAUTEUR_ENTITE * 0.62, 0)
  vue.planLacet.setLocalEulerAngles(0, -34, 0)
  vue.planRoulis.setLocalEulerAngles(0, 0, 45)
}

/** Plan des balayages : horizontal, a peine incline, autour de l'axe vertical. */
function planHorizontal(vue: Vue): void {
  vue.planLacet.setLocalPosition(RAYON_ENTITE * 0.7, HAUTEUR_ENTITE * 0.6, 0)
  vue.planLacet.setLocalEulerAngles(0, 0, 0)
  vue.planRoulis.setLocalEulerAngles(0, 0, -14)
}

/**
 * Plan des coups du marteau vers le sol : presque vertical — la tete tombe
 * devant soi, la ou frappe l'ecrasement —, juste assez tourne en lacet pour ne
 * pas etre vu par la tranche depuis la camera. La tete, massive, se lit meme
 * dans un plan si proche de l'axe avant ; une lame fine, non.
 */
function planEcrasement(vue: Vue): void {
  vue.planLacet.setLocalPosition(RAYON_ENTITE * 0.8, HAUTEUR_ENTITE * 0.62, 0)
  vue.planLacet.setLocalEulerAngles(0, -20, 0)
  vue.planRoulis.setLocalEulerAngles(0, 0, -22)
}

/**
 * Recopie la pose locale de `source` sur `cible` en miroir du plan median du
 * corps (x -> -x). Pour une rotation, le miroir garde x et w du quaternion et
 * inverse y et z. Applique maillon par maillon, il donne le miroir exact de
 * toute la chaine.
 */
function miroir(source: pc.Entity, cible: pc.Entity): void {
  const p = source.getLocalPosition()
  cible.setLocalPosition(-p.x, p.y, p.z)
  const q = source.getLocalRotation()
  cible.setLocalRotation(q.x, -q.y, -q.z, q.w)
}

/** Echantillonne la pointe de lame pendant la frappe, pas pendant l'armement. */
function majTrainee(trainee: pc.Vec3[], actif: boolean, pointe: pc.Entity): void {
  if (!actif) {
    if (trainee.length > 0) trainee.length = 0
    return
  }
  trainee.push(pointe.getPosition().clone())
  if (trainee.length > 14) trainee.shift()
}

/** Ruee : buste jete en avant, bras en arriere, arme pointee devant. */
function poseRuee(vue: Vue): Pose {
  vue.planLacet.setLocalPosition(RAYON_ENTITE * 0.8, HAUTEUR_ENTITE * 0.6, 0)
  vue.planLacet.setLocalEulerAngles(0, 0, 0)
  vue.planRoulis.setLocalEulerAngles(0, 0, -12)
  vue.arme.setLocalPosition(0, 0, -0.52)
  vue.pivotArme.setLocalEulerAngles(-6, 0, 0)
  vue.matArme.emissive.set(0.5, 0.5, 0.6)
  // Gants ramenes en arriere : le corps est jete en avant, les mains suivent.
  for (let i = 0; i < 2; i++) vue.membres[i]!.setLocalPosition((i === 0 ? -1 : 1) * 0.02, -0.05, 0.16)
  return { torsion: 0, penche: -34, trainee: false }
}

// --- Chronologie d'un coup ----------------------------------------------------

/** 'tenue' et 'frappe2' : entre les deux impacts d'un geste double, puis le second. */
type Phase = 'repos' | 'armement' | 'frappe' | 'tenue' | 'frappe2' | 'retour' | 'annule'

interface Coup {
  phase: Phase
  /** Progression lissee dans la phase, de 0 a 1. */
  k: number
  /** Eclat de la lame, de 0 a 1 : il culmine a chaque impact. */
  eclat: number
  /** Valeur d'un canal d'animation a trois poses : repos -> armee -> impact -> repos. */
  val(repos: number, armee: number, impact: number): number
}

const REPOS: Coup = { phase: 'repos', k: 0, eclat: 0, val: (repos) => repos }

/** Geste double : part du chemin parcourue au premier impact. */
const MI_COURSE = 0.55

/** `etape` : rang du geste, fige au depart du coup. C'est lui qui dit s'il est double. */
function coupNormal(e: Entite, temps: number, etape: number): Coup {
  // Le dernier coup etait un coup lourd, un plongeon, un tour ou un coup
  // special : rien a jouer ici.
  if (
    e.typeDernierCoup !== 'normal' ||
    e.dernierCoupA === e.dernierLourdA ||
    e.dernierCoupA === e.dernierPlongeonA ||
    e.dernierCoupA === e.dernierTourA
  ) {
    return REPOS
  }
  const arme = ARMES[e.arme]
  const geste = arme.gestes[clamp(etape, 0, arme.gestes.length - 1)]!
  const annuleA = annulationDe(e, e.dernierCoupA)
  const frappe = e.arme === 'marteau' ? FRAPPE_MARTEAU : FRAPPE_NORMAL
  const delai2 = geste.coups === 2 ? DELAI_DOUBLE_COUP : null
  return lireCoup(temps - e.dernierCoupA, arme.windup, frappe, arme.dureeSwing, annuleA, delai2)
}

function coupLourd(e: Entite, temps: number): Coup {
  const annuleA = annulationDe(e, e.dernierLourdA)
  return lireCoup(temps - e.dernierLourdA, WINDUP_LOURD, FRAPPE_LOURD, LOURD_SWING, annuleA, null)
}

/** Temps ecoule entre le lancement du coup et son annulation, ou null s'il a porte. */
function annulationDe(e: Entite, lanceA: number): number | null {
  return e.attaqueAnnuleeA >= lanceA ? e.attaqueAnnuleeA - lanceA : null
}

/**
 * Ou en est un coup lance il y a `ecoule` secondes. L'impact tombe a `windup`,
 * precede d'une frappe de duree `frappe` ; tout ce qui vient avant est l'armement.
 *
 * `delai2` : le geste frappe deux fois, a cet ecart. La premiere frappe
 * s'arrete a mi-course (MI_COURSE), la lame s'y tient un instant, puis la
 * seconde finit le geste au second impact. Deux accelerations, deux eclats.
 */
function lireCoup(
  ecoule: number,
  windup: number,
  frappe: number,
  duree: number,
  annuleA: number | null,
  delai2: number | null,
): Coup {
  const double = delai2 !== null
  const mi = double ? MI_COURSE : 1
  if (annuleA !== null && ecoule >= annuleA) {
    // Fige la pose au moment de l'annulation, puis la ramene au repos pour la
    // fin du swing : le verrou d'attaque, lui, court toujours jusque-la.
    const fige = lireCoup(annuleA, windup, frappe, duree, null, delai2)
    const k = lisse(clamp((ecoule - annuleA) / (duree - annuleA), 0, 1))
    return { phase: 'annule', k, eclat: 0, val: (r, a, i) => lerp(fige.val(r, a, i), r, k) }
  }

  const debutFrappe = windup - frappe
  const impact2 = windup + (delai2 ?? 0)
  const debutFrappe2 = impact2 - frappe
  const finFrappes = double ? impact2 : windup
  let phase: Phase
  let k: number
  let eclat = 0
  if (ecoule < 0 || ecoule >= duree) {
    phase = 'repos'
    k = 0
  } else if (ecoule < debutFrappe) {
    phase = 'armement'
    k = lisse(ecoule / debutFrappe)
  } else if (ecoule < windup) {
    // Acceleration jusqu'a l'impact : la vitesse maximale tombe sur le coup.
    const p = (ecoule - debutFrappe) / frappe
    phase = 'frappe'
    k = p * p
    eclat = k
  } else if (double && ecoule < debutFrappe2) {
    phase = 'tenue'
    k = (ecoule - windup) / (debutFrappe2 - windup)
    eclat = 1 - k
  } else if (double && ecoule < impact2) {
    const p = (ecoule - debutFrappe2) / frappe
    phase = 'frappe2'
    k = p * p
    eclat = k
  } else {
    phase = 'retour'
    k = lisse((ecoule - finFrappes) / (duree - finFrappes))
    eclat = Math.max(0, 1 - k * 3)
  }
  return { phase, k, eclat, val: (r, a, i) => canal(phase, k, r, a, i, mi) }
}

function canal(phase: Phase, k: number, repos: number, armee: number, impact: number, mi: number): number {
  const milieu = lerp(armee, impact, mi)
  if (phase === 'armement') return lerp(repos, armee, k)
  if (phase === 'frappe') return lerp(armee, milieu, k)
  if (phase === 'tenue') return milieu
  if (phase === 'frappe2') return lerp(milieu, impact, k)
  if (phase === 'retour') return lerp(impact, repos, k)
  return repos
}

/** La trainee accompagne les frappes et le tout debut du retour. */
function traineeSur(c: Coup): boolean {
  return c.phase === 'frappe' || c.phase === 'tenue' || c.phase === 'frappe2' || (c.phase === 'retour' && c.k < 0.3)
}

/**
 * Image-cle d'un canal d'animation : a `t` secondes du lancement du coup, il
 * vaut `v`. `accel` : le segment qui y mene accelere jusqu'a elle — une
 * frappe, dont la vitesse maximale tombe sur l'impact —, sinon il se lisse.
 * Pour les coups dont la chronologie ne tient pas en trois poses.
 */
interface Cle {
  t: number
  v: number
  accel?: boolean
}

function lireCles(t: number, cles: readonly Cle[]): number {
  const premiere = cles[0]!
  if (t <= premiere.t) return premiere.v
  for (let i = 1; i < cles.length; i++) {
    const b = cles[i]!
    if (t < b.t) {
      const a = cles[i - 1]!
      const p = (t - a.t) / (b.t - a.t)
      return lerp(a.v, b.v, b.accel ? p * p : lisse(p))
    }
  }
  return cles[cles.length - 1]!.v
}

/**
 * Comme lireCles, avec l'annulation de lireCoup : un coup annule a `annuleA`
 * se fige la, puis revient a `repos` pour `fin`, sans jamais jouer sa frappe.
 */
function lireClesAnnulables(
  t: number,
  cles: readonly Cle[],
  annuleA: number | null,
  fin: number,
  repos: number,
): number {
  if (annuleA === null || t < annuleA) return lireCles(t, cles)
  const k = lisse(clamp((t - annuleA) / Math.max(1e-3, fin - annuleA), 0, 1))
  return lerp(lireCles(annuleA, cles), repos, k)
}

/** Eclat d'un impact : il monte pendant la frappe, culmine sur le coup et retombe aussitot. */
function eclatImpact(t: number, impact: number, frappe: number): number {
  if (t < impact - frappe || t > impact + 0.2) return 0
  if (t <= impact) {
    const p = (t - (impact - frappe)) / frappe
    return p * p
  }
  return 1 - (t - impact) / 0.2
}

function lisse(p: number): number {
  return p * p * (3 - 2 * p)
}

function distance(a: pc.Vec3, e: Entite): number {
  return Math.hypot(a.x - e.pos.x, a.y - e.pos.y, a.z - e.pos.z)
}
