import { avant, clamp, distanceXZ, type Vec3 } from './math'
import type { ArmeId, Entite } from './types'

/** Ce que fait le clic droit. */
export type ActionSpeciale = 'aucune' | 'ruee' | 'tourbillon'

export interface Arme {
  id: ArmeId
  nom: string
  /**
   * Degats de chaque coup normal de l'enchainement, sur 100 PV de base. Une
   * seule valeur : pas d'enchainement, chaque clic donne le meme coup.
   */
  degats: readonly number[]
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
  /** En l'air, le clic gauche plonge au lieu de frapper. */
  plonge: boolean
  speciale: ActionSpeciale
}

/**
 * §2 — on commence nu, on frappe aux poings. Toute la puissance passe par
 * l'equipement ramasse, donc par ce qui se perd. Que des armes de corps a
 * corps : pas de frustration pour qui ne veut jouer qu'au contact.
 *
 * TTK vise 2-4 s (§2) sur 100 PV, du premier coup a la mort :
 *   epee   22 degats      -> 5 coups  -> 4 x 0.60 s = 2.4 s
 *   hache  24 / 24 / 30   -> 4 coups  -> 3 x 0.70 s = 2.1 s, plus le temps de
 *                            rejoindre une cible que le 3e coup a projetee
 *   poings 11 degats      -> 10 coups -> 9 x 0.45 s = 4.0 s
 * L'ecart arme nue/equipee est de 1.5x a 1.9x ici ; les 2.5-3x vises en §2
 * incluent l'armure, qui n'existe pas encore.
 */
export const ARMES: Record<ArmeId, Arme> = {
  poings: {
    id: 'poings',
    nom: 'Poings',
    degats: [11],
    dureeSwing: 0.45,
    portee: 2.6,
    demiAngle: (60 * Math.PI) / 180,
    porteeLourd: 3.4,
    plonge: false,
    speciale: 'aucune',
  },
  epee: {
    id: 'epee',
    nom: 'Epee',
    degats: [22],
    dureeSwing: 0.6,
    portee: 3.2,
    demiAngle: (70 * Math.PI) / 180,
    porteeLourd: 3.4,
    plonge: true,
    speciale: 'ruee',
  },
  /**
   * Facon Counter Sword de S4 League : lente, longue, un enchainement de trois
   * coups, un coup lourd qui porte loin — et le tourbillon de la batte au clic
   * droit a la place de la garde.
   */
  hache: {
    id: 'hache',
    nom: 'Longue hache',
    degats: [24, 24, 30],
    dureeSwing: 0.7,
    portee: 3.6,
    demiAngle: (70 * Math.PI) / 180,
    porteeLourd: 4.4,
    plonge: true,
    speciale: 'tourbillon',
  },
}

/**
 * Jauge sous le reticule : 0 au lancement d'un coup, 1 a la fin de son
 * animation, quand on peut refrapper. Vide pendant une ruee ou un plongeon,
 * dont la fin n'est pas connue d'avance.
 */
export function jaugeCoup(entite: Entite, temps: number): number {
  if (entite.ruee !== 'aucun' || entite.plongeon !== 'aucun') return 0
  if (temps >= entite.finSwing) return 1
  return clamp((temps - entite.dernierCoupA) / (entite.finSwing - entite.dernierCoupA), 0, 1)
}

/**
 * Cible unique dans le cone de frappe, la plus proche en distance angulaire.
 * On ignore les entites en invulnerabilite : mieux vaut toucher quelqu'un d'autre
 * que gaspiller le coup sur une cible qui ne peut rien prendre.
 */
export function cibleDevant(
  attaquant: Entite,
  temps: number,
  candidats: Iterable<Entite>,
  porteeForcee?: number,
  demiAngleForce?: number,
): Entite | null {
  const armeDeBase = ARMES[attaquant.arme]
  const arme = {
    portee: porteeForcee ?? armeDeBase.portee,
    demiAngle: demiAngleForce ?? armeDeBase.demiAngle,
  }
  const f = avant(attaquant.yaw)
  let meilleure: Entite | null = null
  let meilleurScore = Infinity

  for (const c of candidats) {
    if (c === attaquant || !c.vivant) continue
    if (temps < c.invulnJusqua) continue

    const d = distanceXZ(attaquant.pos, c.pos)
    if (d > arme.portee) continue

    const vers: Vec3 = { x: c.pos.x - attaquant.pos.x, y: 0, z: c.pos.z - attaquant.pos.z }
    const len = Math.hypot(vers.x, vers.z) || 1
    const cos = (f.x * vers.x + f.z * vers.z) / len
    const angle = Math.acos(clamp(cos, -1, 1))
    if (angle > arme.demiAngle) continue

    // On privilegie l'alignement, puis la distance.
    const score = angle * 2 + d * 0.1
    if (score < meilleurScore) {
      meilleurScore = score
      meilleure = c
    }
  }

  return meilleure
}

/** Toutes les cibles a portee, dans toutes les directions : le tourbillon. */
export function ciblesAutour(
  attaquant: Entite,
  temps: number,
  candidats: Iterable<Entite>,
  rayon: number,
): Entite[] {
  const touchees: Entite[] = []
  for (const c of candidats) {
    if (c === attaquant || !c.vivant) continue
    if (temps < c.invulnJusqua) continue
    if (distanceXZ(attaquant.pos, c.pos) <= rayon) touchees.push(c)
  }
  return touchees
}
