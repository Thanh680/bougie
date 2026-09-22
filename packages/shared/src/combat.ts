import { CHARGE_MIN } from './constants'
import { avant, clamp, distanceXZ, type Vec3 } from './math'
import type { ArmeId, Entite } from './types'

export interface Arme {
  id: ArmeId
  nom: string
  /** Degats a charge pleine, sur 100 PV de base. */
  degats: number
  /** Temps pour revenir a charge pleine. C'est lui qui fixe le TTK. */
  recharge: number
  /** Portee horizontale, mesuree entre les centres. */
  portee: number
  /** Demi-angle du cone de frappe, en radians. */
  demiAngle: number
}

/**
 * §2 — on commence nu, on frappe aux poings. Toute la puissance passe par
 * l'equipement ramasse, donc par ce qui se perd.
 *
 * TTK vise 2-4 s (§2) sur 100 PV :
 *   epee   22 degats -> 5 coups -> 4 x 0.60 s = 2.4 s
 *   poings 11 degats -> 10 coups -> 9 x 0.45 s = 4.0 s
 * L'ecart arme nue/equipee est de 1.5x ici ; les 2.5-3x vises en §2 incluent
 * l'armure, qui n'existe pas encore.
 */
export const ARMES: Record<ArmeId, Arme> = {
  poings: {
    id: 'poings',
    nom: 'Poings',
    degats: 11,
    recharge: 0.45,
    portee: 2.6,
    demiAngle: (60 * Math.PI) / 180,
  },
  epee: {
    id: 'epee',
    nom: 'Epee',
    degats: 22,
    recharge: 0.6,
    portee: 3.2,
    demiAngle: (70 * Math.PI) / 180,
  },
}

/** 0 -> arme froide, 1 -> charge pleine. Affiche par le HUD sous le reticule. */
export function chargeDe(entite: Entite, temps: number): number {
  const arme = ARMES[entite.arme]
  return clamp((temps - entite.dernierCoupA) / arme.recharge, 0, 1)
}

/**
 * Courbe de degats de Minecraft : 0.2 + 0.8 * t^2.
 * Cliquer vite reste possible mais devient mathematiquement mauvais — la
 * sanction du spam est dans la courbe, pas dans un verrou.
 */
export function degatsAvecCharge(degatsPleins: number, charge: number): number {
  return degatsPleins * (CHARGE_MIN + (1 - CHARGE_MIN) * charge * charge)
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
