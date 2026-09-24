import { CHARGE_DUREE, COUP_DOS_DEMI_ANGLE, MARTEAU_WINDUP, WINDUP_NORMAL } from './constants'
import { avant, clamp, distanceXZ, type Vec3 } from './math'
import type { ArmeId, Entite, EntityId } from './types'

/** Ce que fait le clic droit. */
export type ActionSpeciale = 'aucune' | 'ruee' | 'tourbillon' | 'uppercut' | 'charge'

/**
 * Ce que fait le clic gauche en l'air : un coup normal (poings), un plongeon a
 * la verticale sur sa propre position (epee) ou en avant sur le point vise
 * (hache), le fauchage aerien de la double epee, la frappe sautee du marteau.
 */
export type CoupEnLAir = 'coup' | 'plongeon' | 'plongeonAvant' | 'fauche' | 'sautee'

/**
 * Ce que fait le maintien du clic gauche. 'projection' : une cible, projetee.
 * 'cone' : toutes celles du cone, projetees. 'dos' : une cible, pas projetee,
 * frappee une seconde fois si on l'a prise dans le dos. 'aucun' : l'arme n'a
 * pas de coup lourd, le coup normal part des l'appui.
 */
export type CoupLourd = 'projection' | 'cone' | 'dos' | 'aucun'

/** Un geste de l'enchainement du clic gauche. */
export interface Geste {
  /** Degats du geste sur 100 PV de base, partages entre ses coups. */
  degats: number
  /** 2 : le geste frappe deux fois, a DELAI_DOUBLE_COUP d'ecart. */
  coups: number
  /**
   * Qui il frappe : 'cible', la mieux alignee dans le cone ; 'cone', toutes
   * celles du cone ; 'autour', toutes celles a portee, dans toutes les directions.
   */
  zone: 'cible' | 'cone' | 'autour'
  /**
   * Ce que fait son dernier coup a chaque cible touchee : 'projection', la
   * projection legere ; 'croc', la cible trebuche (CROC_STUN).
   */
  effet: 'aucun' | 'projection' | 'croc'
  /** Petite ruee en avant pendant l'armement, en metres. 0 : aucune. */
  elan: number
}

export interface Arme {
  id: ArmeId
  nom: string
  /**
   * L'enchainement du clic gauche : un clic pendant un geste lance le suivant
   * a sa fin, jusqu'au dernier. Un seul geste : pas d'enchainement, chaque clic
   * donne le meme coup.
   */
  gestes: readonly Geste[]
  /** Delai d'impact d'un coup normal : l'armement, pendant lequel il s'annule. */
  windup: number
  /**
   * Duree totale d'un coup normal, animation comprise. Aucun nouveau coup avant
   * la fin : c'est elle qui fixe la cadence, donc le TTK.
   */
  dureeSwing: number
  /** Portee horizontale, mesuree entre les centres. */
  portee: number
  /** Demi-angle du cone de frappe, en radians. */
  demiAngle: number
  porteeLourd: number
  lourd: CoupLourd
  enLAir: CoupEnLAir
  /** L'impact du plongeon frappe tout autour, et pas seulement devant. */
  plongeonAutour: boolean
  speciale: ActionSpeciale
  /** Ni deplacement, ni saut, ni esquive pendant ses coups au sol (le Breaker). */
  immobile: boolean
}

const DEG = Math.PI / 180

/**
 * §2 — on commence nu, on frappe aux poings. Toute la puissance passe par
 * l'equipement ramasse, donc par ce qui se perd. Que des armes de corps a
 * corps, toutes inspirees de S4 League : pas de frustration pour qui ne veut
 * jouer qu'au contact.
 *
 * TTK vise 2-4 s (§2) sur 100 PV, du premier coup a la mort, au clic seul :
 *   epee         22 degats         -> 5 coups  -> 4 x 0.60 s = 2.4 s
 *   hache        24 / 24 / 30      -> 4 gestes -> 3 x 0.70 s = 2.1 s, plus le temps de
 *                (en 2 x 12, 12, 15)  rejoindre une cible que le 3e geste a projetee
 *   double epee  15 / 18 / 22      -> 6 gestes -> 5 x 0.55 s = 2.75 s
 *   marteau      34, en cone       -> 3 coups  -> 2 x 1.10 s = 2.2 s
 *   poings       11 degats         -> 10 coups -> 9 x 0.45 s = 4.0 s
 * L'ecart arme nue/equipee est de 1.5x a 1.9x ici ; les 2.5-3x vises en §2
 * incluent l'armure, qui n'existe pas encore.
 */
export const ARMES: Record<ArmeId, Arme> = {
  poings: {
    id: 'poings',
    nom: 'Poings',
    gestes: [{ degats: 11, coups: 1, zone: 'cible', effet: 'aucun', elan: 0 }],
    windup: WINDUP_NORMAL,
    dureeSwing: 0.45,
    portee: 2.6,
    demiAngle: 60 * DEG,
    porteeLourd: 3.4,
    lourd: 'projection',
    enLAir: 'coup',
    plongeonAutour: false,
    speciale: 'aucune',
    immobile: false,
  },
  epee: {
    id: 'epee',
    nom: 'Epee',
    gestes: [{ degats: 22, coups: 1, zone: 'cible', effet: 'aucun', elan: 0 }],
    windup: WINDUP_NORMAL,
    dureeSwing: 0.6,
    portee: 3.2,
    demiAngle: 70 * DEG,
    porteeLourd: 3.4,
    lourd: 'projection',
    enLAir: 'plongeon',
    plongeonAutour: false,
    speciale: 'ruee',
    immobile: false,
  },
  /**
   * Facon Counter Sword de S4 League : lente, longue, un enchainement de trois
   * gestes qui frappent chacun deux fois, un uppercut qui balaie tout un cone —
   * et le tourbillon de la batte au clic droit a la place de la garde.
   */
  hache: {
    id: 'hache',
    nom: 'Longue hache',
    gestes: [
      { degats: 24, coups: 2, zone: 'cible', effet: 'aucun', elan: 1 },
      { degats: 24, coups: 2, zone: 'cible', effet: 'aucun', elan: 1 },
      { degats: 30, coups: 2, zone: 'cible', effet: 'projection', elan: 1 },
    ],
    windup: WINDUP_NORMAL,
    dureeSwing: 0.7,
    portee: 3.6,
    demiAngle: 70 * DEG,
    porteeLourd: 4.4,
    lourd: 'cone',
    enLAir: 'plongeonAvant',
    plongeonAutour: true,
    speciale: 'tourbillon',
    immobile: false,
  },
  /**
   * Les coups de la Death Scythe de S4 League (l'EXO Scythe), deux lames en
   * main : balayage, toupie a double coup, puis ruee et coup montant qui fait
   * trebucher ; un coup fort qui frappe deux fois dans le dos ; un uppercut qui
   * fait decoller tout le monde et un fauchage aerien, tous deux payes en
   * stamina. L'arme des enchainements, et de ceux qui fuient.
   */
  doubleEpee: {
    id: 'doubleEpee',
    nom: 'Double epee',
    gestes: [
      { degats: 15, coups: 1, zone: 'cible', effet: 'aucun', elan: 0.5 },
      { degats: 18, coups: 2, zone: 'autour', effet: 'aucun', elan: 0.5 },
      { degats: 22, coups: 1, zone: 'cible', effet: 'croc', elan: 2.5 },
    ],
    windup: WINDUP_NORMAL,
    dureeSwing: 0.55,
    portee: 3,
    demiAngle: 70 * DEG,
    porteeLourd: 3.4,
    lourd: 'dos',
    enLAir: 'fauche',
    plongeonAutour: false,
    speciale: 'uppercut',
    immobile: false,
  },
  /**
   * Les coups du Breaker de S4 League : un balayage tres lent a 270 deg qui
   * projette tout ce qu'il touche, immobile ; une charge au clic droit qui
   * ecrase le sol devant, payee en stamina ; une frappe sautee rapide. Pas de
   * coup lourd au maintien.
   */
  marteau: {
    id: 'marteau',
    nom: 'Marteau',
    gestes: [{ degats: 34, coups: 1, zone: 'cone', effet: 'projection', elan: 0.5 }],
    windup: MARTEAU_WINDUP,
    dureeSwing: 1.1,
    portee: 3.6,
    demiAngle: 135 * DEG,
    porteeLourd: 3.4,
    lourd: 'aucun',
    enLAir: 'sautee',
    plongeonAutour: false,
    speciale: 'charge',
    immobile: true,
  },
}

/** Le geste en cours de l'enchainement, ou le premier. */
export function gesteDe(entite: Entite): Geste {
  const gestes = ARMES[entite.arme].gestes
  return gestes[clamp(entite.comboEtape, 0, gestes.length - 1)]!
}

/**
 * Jauge sous le reticule : 0 au lancement d'un coup, 1 a la fin de son
 * animation, quand on peut refrapper. Vide pendant une ruee, un plongeon ou la
 * chute d'un fauchage aerien, dont la fin n'est pas connue d'avance.
 */
export function jaugeCoup(entite: Entite, temps: number): number {
  if (entite.ruee !== 'aucun' || entite.plongeon !== 'aucun' || entite.chuteLibre) return 0
  if (temps >= entite.finSwing) return 1
  return clamp((temps - entite.dernierCoupA) / (entite.finSwing - entite.dernierCoupA), 0, 1)
}

/** Niveau de la charge du marteau en cours, de 0 a 1 ; null hors charge. */
export function chargeEnCours(entite: Entite, temps: number): number | null {
  if (entite.chargeDepuis < 0) return null
  return clamp((temps - entite.chargeDepuis) / CHARGE_DUREE, 0, 1)
}

/**
 * Peut-on frapper `c` ? On ignore les entites en invulnerabilite — mieux vaut
 * toucher quelqu'un d'autre que gaspiller le coup sur une cible qui ne peut
 * rien prendre — sauf celles de `retouchables` : le second coup d'un geste
 * frappe encore ce que le premier vient de toucher.
 */
function touchable(attaquant: Entite, c: Entite, temps: number, retouchables: readonly EntityId[]): boolean {
  if (c === attaquant || !c.vivant) return false
  return temps >= c.invulnJusqua || retouchables.includes(c.id)
}

/** Ecart angulaire entre l'avant de l'attaquant et la direction de `c`, en radians. */
function angleVers(attaquant: Entite, c: Entite): number {
  const f = avant(attaquant.yaw)
  const vers: Vec3 = { x: c.pos.x - attaquant.pos.x, y: 0, z: c.pos.z - attaquant.pos.z }
  const len = Math.hypot(vers.x, vers.z) || 1
  return Math.acos(clamp((f.x * vers.x + f.z * vers.z) / len, -1, 1))
}

/** L'attaquant est-il dans le dos de la cible, a COUP_DOS_DEMI_ANGLE pres ? */
export function dansLeDos(attaquant: Entite, cible: Entite): boolean {
  return angleVers(cible, attaquant) >= Math.PI - COUP_DOS_DEMI_ANGLE
}

/** Cible unique dans le cone de frappe, la plus proche en distance angulaire. */
export function cibleDevant(
  attaquant: Entite,
  temps: number,
  candidats: Iterable<Entite>,
  porteeForcee?: number,
  demiAngleForce?: number,
  retouchables: readonly EntityId[] = [],
): Entite | null {
  const armeDeBase = ARMES[attaquant.arme]
  const portee = porteeForcee ?? armeDeBase.portee
  const demiAngle = demiAngleForce ?? armeDeBase.demiAngle
  let meilleure: Entite | null = null
  let meilleurScore = Infinity

  for (const c of candidats) {
    if (!touchable(attaquant, c, temps, retouchables)) continue
    const d = distanceXZ(attaquant.pos, c.pos)
    if (d > portee) continue
    const angle = angleVers(attaquant, c)
    if (angle > demiAngle) continue

    // On privilegie l'alignement, puis la distance.
    const score = angle * 2 + d * 0.1
    if (score < meilleurScore) {
      meilleurScore = score
      meilleure = c
    }
  }

  return meilleure
}

/** Quelqu'un devant, a portee, invulnerable ou non : la petite ruee s'arrete au contact. */
export function quelquunDevant(attaquant: Entite, candidats: Iterable<Entite>, portee: number, demiAngle: number): boolean {
  for (const c of candidats) {
    if (c === attaquant || !c.vivant) continue
    if (distanceXZ(attaquant.pos, c.pos) <= portee && angleVers(attaquant, c) <= demiAngle) return true
  }
  return false
}

/** Toutes les cibles du cone : l'uppercut de la hache, le balayage du marteau. */
export function ciblesDansCone(
  attaquant: Entite,
  temps: number,
  candidats: Iterable<Entite>,
  portee: number,
  demiAngle: number,
  retouchables: readonly EntityId[] = [],
): Entite[] {
  const touchees: Entite[] = []
  for (const c of candidats) {
    if (!touchable(attaquant, c, temps, retouchables)) continue
    if (distanceXZ(attaquant.pos, c.pos) <= portee && angleVers(attaquant, c) <= demiAngle) touchees.push(c)
  }
  return touchees
}

/** Toutes les cibles a portee, dans toutes les directions : le tourbillon. */
export function ciblesAutour(
  attaquant: Entite,
  temps: number,
  candidats: Iterable<Entite>,
  rayon: number,
  retouchables: readonly EntityId[] = [],
): Entite[] {
  const touchees: Entite[] = []
  for (const c of candidats) {
    if (!touchable(attaquant, c, temps, retouchables)) continue
    if (distanceXZ(attaquant.pos, c.pos) <= rayon) touchees.push(c)
  }
  return touchees
}
