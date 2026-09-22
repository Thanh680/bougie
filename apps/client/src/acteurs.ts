import * as pc from 'playcanvas'
import {
  DUREE_ESQUIVE,
  DUREE_SWING,
  HAUTEUR_ENTITE,
  LOURD_SWING,
  PLONGEON_PORTEE,
  RAYON_ENTITE,
  RECUPERATION_PLONGEON,
  WINDUP_LOURD,
  WINDUP_NORMAL,
  clamp,
  deltaAngle,
  lerp,
  palierDe,
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
 * Animation d'attaque.
 *
 * Contrainte : le coup est INSTANTANE cote simulation (c'est ce qui le rend
 * insensible au ping, §3). L'animation ne peut donc pas commencer par une
 * armee — les degats sont deja passes. Elle claque directement dans la frappe
 * et prend son temps sur le retour : le mouvement reste lisible sans jamais
 * raconter autre chose que ce qui s'est reellement produit.
 */
// Rotation du pivot autour de X. Positif = lame levee, negatif = lame baissee :
// le swing est une taille descendante, de haut en arriere vers bas en avant.
const ARME_REPOS = -8
const ARME_ARMEE = 150
const ARME_FRAPPE = -55
const TORSE_ARME = 30
const TORSE_FRAPPE = -32
/**
 * Part du swing consacree a la frappe. Le reste est le retour.
 * Cale sur WINDUP_NORMAL / DUREE_SWING : la lame doit arriver sur la cible
 * exactement au moment ou la simulation applique les degats.
 */
const PART_FRAPPE = WINDUP_NORMAL / DUREE_SWING
/** Idem pour le coup lourd. */
const PART_FRAPPE_LOURD = WINDUP_LOURD / LOURD_SWING

/**
 * Coup lourd : lacet de la lame, en degres, autour de l'axe VERTICAL.
 * -125 = bras arme sur la droite, +30 = lame devant, legerement a gauche.
 * Le balayage passe donc franchement devant le personnage.
 */
const LOURD_DEPART = -125
const LOURD_ARRIVEE = 30

/** Cote du cube qui sert de gant. */
const GANT = 0.24

const DUREE_ONDE = 0.38

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
  matArme: pc.StandardMaterial
  /** Les deux bras existent toujours. Seul celui qui frappe s'allonge. */
  bras: [pc.Entity, pc.Entity]
  membres: [pc.Entity, pc.Entity]
  /** Alterne a chaque coup de poing : sinon on frappe toujours du meme bras. */
  poingGauche: boolean
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
  initialisee: boolean
}

interface Onde {
  x: number
  z: number
  y: number
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
      this.ondes.push({ x: 0, y: 0, z: 0, debut: -99, entite, materiau: materiau_ })
    }
  }

  positionRendu(id: EntityId): pc.Vec3 | null {
    return this.vues.get(id)?.posRendu ?? null
  }

  /** Effets declenches par un evenement plutot que par un etat continu. */
  consommer(evenements: readonly Evenement[]): void {
    for (const ev of evenements) {
      if (ev.type === 'plongeon_impact') {
        const onde = this.ondes[this.prochaineOnde % NB_ONDES]!
        this.prochaineOnde++
        onde.x = ev.pos.x
        onde.y = ev.pos.y
        onde.z = ev.pos.z
        onde.debut = this.horloge
      }
    }
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
    const couleurBase = local ? new pc.Color(0.3, 0.6, 1) : new pc.Color(0.78, 0.33, 0.29)

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
      matArme,
      planLacet,
      planRoulis,
      bras,
      membres,
      poingGauche: false,
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
      return
    }

    vue.racine.setPosition(vue.posRendu)
    vue.racine.setEulerAngles(0, vue.yawRendu * RAD_TO_DEG, 0)

    const pose = this.majArme(vue, e, temps)
    this.majTorse(vue, e, temps, dt, pose.torsion, pose.penche)
    this.majCorps(vue, e, temps)
    this.majAura(vue, e, temps)
    this.majTrainee(vue, e, temps)
  }

  /** Retourne la torsion (Y) et l'inclinaison avant (X) du torse pour cette frame. */
  private majArme(vue: Vue, e: Entite, temps: number): { torsion: number; penche: number } {
    const epee = e.arme === 'epee'
    vue.arme.enabled = epee
    if (epee) {
      // Lame plate et large : une tige de 8 cm qui balaie en trois images ne se
      // voit pas, une lame de 22 cm de large accroche la lumiere.
      vue.arme.setLocalScale(0.05, 0.22, 1.05)
      vue.arme.setLocalPosition(0, 0, -0.52)
      vue.pointe.setLocalPosition(0, 0, -0.55)
      vue.matArme.diffuse.set(0.85, 0.87, 0.94)
    }

    if (vue.dernierCoupVu !== e.dernierCoupA) {
      vue.dernierCoupVu = e.dernierCoupA
      vue.poingGauche = !vue.poingGauche
    }

    // Les deux gants reviennent d'abord en garde ; les poses qui suivent ne
    // touchent qu'a ce qu'elles animent vraiment.
    this.gantsAuRepos(vue, temps)
    // A l'epee, pas de gants du tout : la lame porte toute l'animation.
    vue.membres[0]!.enabled = !epee
    vue.membres[1]!.enabled = !epee

    // L'armement n'existe plus comme etat separe : le coup lourd est lance des
    // que le maintien est reconnu, et son propre swing sert de telegraphe.
    const enLourd = temps - e.dernierLourdA < LOURD_SWING

    // Le coup lourd passe AVANT la recuperation : lui aussi met le personnage
    // en recuperation, et sans cet ordre son animation etait immediatement
    // ecrasee par la pose « epee plantee » du plongeon.
    // La pose de plongeon est en plus conditionnee a un vrai plongeon recent,
    // pas a une recuperation quelconque.
    const recuperationPlongeon = temps - e.dernierPlongeonA < RECUPERATION_PLONGEON

    let resultat: { torsion: number; penche: number }
    if (e.ruee === 'course') {
      resultat = poseRuee(vue)
    } else if (enLourd) {
      resultat = this.poseLourd(vue, e, temps, epee)
    } else if (e.plongeon !== 'aucun' || recuperationPlongeon) {
      resultat = this.poseplongeon(vue, e, temps)
    } else if (epee) {
      resultat = this.poseEpee(vue, e, temps)
    } else {
      resultat = this.posePoing(vue, e, temps)
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
   * Projette un gant DROIT DEVANT. `ext` va de 0 (garde) a 1 (bras tendu).
   * Aucune derive laterale : le coup part vers le reticule, pas en diagonale.
   */
  private lancerGant(vue: Vue, gauche: boolean, ext: number, allonge: number): void {
    const i = gauche ? 0 : 1
    vue.membres[i]!.setLocalPosition(0, 0, -0.26 - allonge * ext)
    vue.membres[i]!.setLocalScale(GANT * (1 + 0.15 * ext), GANT * (1 + 0.15 * ext), GANT)
  }

  /**
   * Epee : taille descendante dans un plan diagonal.
   * Un balayage purement vertical se fait dans le plan sagittal, celui que la
   * camera regarde par la tranche — il y est invisible quelle que soit son
   * ampleur. Le lacet du plan est ce qui le tourne vers l'objectif.
   */
  private poseEpee(vue: Vue, e: Entite, temps: number): { torsion: number; penche: number } {
    vue.planLacet.setLocalPosition(RAYON_ENTITE * 0.8, HAUTEUR_ENTITE * 0.62, 0)
    vue.planLacet.setLocalEulerAngles(0, -34, 0)
    vue.planRoulis.setLocalEulerAngles(0, 0, -45)
    vue.arme.setLocalPosition(0, 0, -0.52)

    const t = clamp((temps - e.dernierCoupA) / DUREE_SWING, 0, 1)
    let angle: number
    let torsion: number
    let eclat = 0

    if (t < PART_FRAPPE) {
      // Frappe : la lame part deja armee et balaie 205 deg en deux images.
      const p = t / PART_FRAPPE
      const k = 1 - (1 - p) ** 3
      angle = lerp(ARME_ARMEE, ARME_FRAPPE, k)
      torsion = lerp(TORSE_ARME, TORSE_FRAPPE, k)
      eclat = 1 - p
    } else {
      // Retour : lent et visible, c'est lui qui donne son poids au coup.
      const p = (t - PART_FRAPPE) / (1 - PART_FRAPPE)
      const k = p * p * (3 - 2 * p)
      angle = lerp(ARME_FRAPPE, ARME_REPOS, k)
      torsion = lerp(TORSE_FRAPPE, 0, k)
    }

    vue.pivotArme.setLocalEulerAngles(angle, 0, 0)
    vue.matArme.emissive.set(eclat * 0.9, eclat * 0.95, eclat)
    return { torsion, penche: 0 }
  }

  /**
   * Poings : un coup droit, pas une taille. Le bras part de l'epaule et se
   * detend DEVANT, en ligne droite, avec l'epaule opposee qui suit. Les deux
   * poings alternent.
   */
  private posePoing(vue: Vue, e: Entite, temps: number): { torsion: number; penche: number } {
    // Plans neutres : un coup droit n'a pas de plan de balayage.
    vue.planRoulis.setLocalEulerAngles(0, 0, 0)
    vue.planLacet.setLocalEulerAngles(0, 0, 0)
    vue.pivotArme.setLocalEulerAngles(0, 0, 0)

    const t = clamp((temps - e.dernierCoupA) / DUREE_SWING, 0, 1)
    let extension: number
    if (t < PART_FRAPPE) {
      const p = t / PART_FRAPPE
      extension = 1 - (1 - p) ** 3
    } else {
      const p = (t - PART_FRAPPE) / (1 - PART_FRAPPE)
      extension = 1 - p * p * (3 - 2 * p)
    }

    this.lancerGant(vue, vue.poingGauche, extension, 0.66)
    // Aucune torsion du buste : elle ferait pivoter la trajectoire du gant et
    // le coup partirait en diagonale au lieu de partir droit devant.
    return { torsion: 0, penche: 0 }
  }

  /** Coup lourd : un balayage large et lent, bien plus ample que le coup normal. */
  private poseLourd(
    vue: Vue,
    e: Entite,
    temps: number,
    epee: boolean,
  ): { torsion: number; penche: number } {
    const t = clamp((temps - e.dernierLourdA) / LOURD_SWING, 0, 1)
    const frappe = PART_FRAPPE_LOURD
    let k: number
    let retour: boolean
    if (t < frappe) {
      k = 1 - (1 - t / frappe) ** 3
      retour = false
    } else {
      const p = (t - frappe) / (1 - frappe)
      k = 1 - p * p * (3 - 2 * p)
      retour = true
    }

    if (epee) {
      // Balayage HORIZONTAL, autour de l'axe vertical : la lame part de la
      // droite et finit DEVANT. Le coup precedent tournait autour de l'axe
      // lateral et terminait pointe au sol, ce qui ne ressemblait pas a un coup
      // porte devant soi.
      vue.planLacet.setLocalPosition(RAYON_ENTITE * 0.7, HAUTEUR_ENTITE * 0.6, 0)
      vue.planLacet.setLocalEulerAngles(0, 0, 0)
      vue.planRoulis.setLocalEulerAngles(0, 0, -14)
      vue.arme.setLocalPosition(0, 0, -0.52)
      vue.pivotArme.setLocalEulerAngles(0, lerp(LOURD_DEPART, LOURD_ARRIVEE, k), 0)
      const eclat = retour ? 0 : 1 - t / frappe
      vue.matArme.emissive.set(eclat, eclat * 0.9, eclat * 0.6)
    } else {
      this.lancerGant(vue, false, k, 0.82)
      return { torsion: 0, penche: -6 * k }
    }

    return { torsion: lerp(34, -38, k), penche: -6 * k }
  }

  /** Plongeon : lame haute, puis pointee vers le bas, puis plantee dans le sol. */
  private poseplongeon(vue: Vue, e: Entite, temps: number): { torsion: number; penche: number } {
    // Plans neutres : la lame doit etre franchement verticale, pas en diagonale.
    vue.planLacet.setLocalEulerAngles(0, 0, 0)
    vue.planRoulis.setLocalEulerAngles(0, 0, 0)
    vue.arme.setLocalPosition(0, 0, -0.52)

    // Convention de `penche` : positif = le buste part en arriere, negatif = en avant.
    if (e.plongeon === 'suspension') {
      vue.planLacet.setLocalPosition(RAYON_ENTITE * 0.5, HAUTEUR_ENTITE * 0.62, 0)
      vue.pivotArme.setLocalEulerAngles(95, 0, 0) // lame droite au-dessus de la tete
      vue.matArme.emissive.set(0.9, 0.9, 1)
      return { torsion: 0, penche: 12 }
    }

    if (e.plongeon === 'chute') {
      vue.planLacet.setLocalPosition(0.42, HAUTEUR_ENTITE * 0.62, -0.35)
      vue.pivotArme.setLocalEulerAngles(-90, 0, 0) // pointe vers le bas
      vue.matArme.emissive.set(0.9, 0.9, 1)
      return { torsion: 0, penche: -16 }
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
    return { torsion: 0, penche: lerp(-30, -5, p * p) }
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

  /** Echantillonne la pointe de lame pendant la phase de frappe. */
  private majTrainee(vue: Vue, e: Entite, temps: number): void {
    const t = (temps - e.dernierCoupA) / DUREE_SWING
    const frappe =
      e.arme === 'epee' &&
      e.plongeon === 'aucun' &&
      temps >= e.finRecuperation &&
      t >= 0 &&
      t < PART_FRAPPE * 1.8
    if (!frappe) {
      if (vue.trainee.length > 0) vue.trainee.length = 0
      return
    }
    vue.trainee.push(vue.pointe.getPosition().clone())
    if (vue.trainee.length > 14) vue.trainee.shift()
  }

  // --- Effets en mode immediat ----------------------------------------------

  private dessinerTrainees(): void {
    for (const vue of this.vues.values()) {
      const t = vue.trainee
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

      const rayon = 0.5 + (PLONGEON_PORTEE - 0.5) * (1 - (1 - age) ** 2)
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

/** Ruee : buste jete en avant, bras en arriere, arme pointee devant. */
function poseRuee(vue: Vue): { torsion: number; penche: number } {
  vue.planLacet.setLocalPosition(RAYON_ENTITE * 0.8, HAUTEUR_ENTITE * 0.6, 0)
  vue.planLacet.setLocalEulerAngles(0, 0, 0)
  vue.planRoulis.setLocalEulerAngles(0, 0, -12)
  vue.arme.setLocalPosition(0, 0, -0.52)
  vue.pivotArme.setLocalEulerAngles(-6, 0, 0)
  vue.matArme.emissive.set(0.5, 0.5, 0.6)
  // Gants ramenes en arriere : le corps est jete en avant, les mains suivent.
  for (let i = 0; i < 2; i++) vue.membres[i]!.setLocalPosition((i === 0 ? -1 : 1) * 0.02, -0.05, 0.16)
  return { torsion: 0, penche: -34 }
}

function distance(a: pc.Vec3, e: Entite): number {
  return Math.hypot(a.x - e.pos.x, a.y - e.pos.y, a.z - e.pos.z)
}
