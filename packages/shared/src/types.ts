import type { Vec3 } from './math'

export type EntityId = number

export type Espece = 'joueur' | 'mannequin'

export type ArmeId = 'poings' | 'epee'

export type EtatPlongeon = 'aucun' | 'suspension' | 'chute'

export type EtatRuee = 'aucun' | 'course'

export type TypeAttaque = 'aucun' | 'normal' | 'lourd'

/**
 * Entree d'un acteur pour un tick.
 * C'est exactement ce qu'un client enverra sur le reseau plus tard (§4) :
 * des intentions, jamais des positions.
 */
export interface Entree {
  /** Numero de sequence — servira a la reconciliation serveur (§4, etape 2). */
  seq: number
  /** -1 (gauche) .. 1 (droite), relatif a la camera. */
  moveX: number
  /** -1 (arriere) .. 1 (avant), relatif a la camera. */
  moveZ: number
  yaw: number
  pitch: number
  /** Front montant : consomme puis remis a false par la sim. */
  saut: boolean
  /** Front montant : -1 esquive a gauche, 1 a droite, 0 aucune. */
  esquive: number
  /**
   * Etat continu du bouton d'attaque, et seule entree d'attaque.
   * Clic bref = coup normal, maintien = coup lourd. La sim tranche elle-meme.
   */
  attaqueMaintenue: boolean
  /** Front montant : consomme puis remis a false par la sim. */
  ruee: boolean
}

export function entreeVide(): Entree {
  return {
    seq: 0,
    moveX: 0,
    moveZ: 0,
    yaw: 0,
    pitch: 0,
    saut: false,
    esquive: 0,
    attaqueMaintenue: false,
    ruee: false,
  }
}

export interface Entite {
  readonly id: EntityId
  readonly espece: Espece
  nom: string

  pos: Vec3
  vel: Vec3
  yaw: number
  pitch: number
  auSol: boolean

  // Esquive laterale
  finEsquive: number
  /** Entre 0 et 1. Une esquive en consomme COUT_ESQUIVE. */
  jaugeEsquive: number

  /** Vitesse bridee a MULT_RALENTI jusqu'a cette date. Annule par une esquive. */
  ralentiJusqua: number
  /** Fenetre pendant laquelle le plafond de vitesse ne s'applique pas, pour
   *  qu'une poussee de coup lourd ne soit pas rabotee des le premier tick. */
  finPoussee: number

  // Etourdissement : ni deplacement ni attaque. Une esquive en sort, mais pas
  // avant STUN_DELAI_AVANT_ESQUIVE.
  stunJusqua: number
  stunDepuis: number

  /** Attaque sautee a l'epee : suspension en l'air, puis chute a la verticale. */
  plongeon: EtatPlongeon
  finSuspension: number
  /** Date du dernier impact de plongeon. Sert au rendu a distinguer une
   *  recuperation de plongeon d'une recuperation de coup lourd. */
  dernierPlongeonA: number
  /** Apres l'impact : plus aucun controle jusqu'a cette date. */
  finRecuperation: number

  /** Date a laquelle le bouton d'attaque a ete enfonce, ou -99. */
  maintienDepuis: number
  /** Evite qu'un relachement apres un coup lourd declenche aussi un coup normal. */
  lourdPendantCeMaintien: boolean
  dernierLourdA: number

  // Attaque en vol : lancee, pas encore resolue. Annulee si on encaisse.
  attaqueEnCours: TypeAttaque
  attaqueImpactA: number

  // Ruee
  ruee: EtatRuee
  rueeOrigine: Vec3
  rueeDirection: Vec3
  /** -1 gauche, 1 droite. Sert au rendu (inclinaison du corps et de la camera). */
  directionEsquive: number

  vivant: boolean
  pv: number
  pvMax: number

  // Progression — remise a zero complete a la mort (§2)
  niveau: number
  xp: number
  serie: number
  meilleureSerie: number
  kills: number
  morts: number

  arme: ArmeId

  // Horodatages de combat (en temps de simulation, secondes)
  dernierCoupA: number
  finSwing: number
  chargeDernierCoup: number
  invulnJusqua: number
  dernierDegatSubiA: number
  tempsReapparition: number

  /**
   * Qui m'a touche et quand. Sert a la prime partagee sur 10 s (§2).
   * Deja renseigne, pas encore exploite : il n'y a pas de prime sur une map vide.
   */
  contributeurs: Map<EntityId, number>

  entree: Entree
  ia?: EtatIA
}

export interface EtatIA {
  cible: EntityId
  prochaineDecision: number
  prochaineAttaque: number
  biaisStrafe: number
}

export type Evenement =
  | { type: 'coup'; attaquant: EntityId; cible: EntityId; degats: number; critique: boolean; charge: number; pos: Vec3 }
  | { type: 'coup_vide'; attaquant: EntityId; charge: number }
  | { type: 'esquive'; entite: EntityId; direction: number }
  | { type: 'coup_lourd'; attaquant: EntityId; cible: EntityId | null }
  | { type: 'attaque_lancee'; entite: EntityId; lourd: boolean }
  | { type: 'attaque_annulee'; entite: EntityId }
  | { type: 'ruee'; entite: EntityId }
  | { type: 'ruee_impact'; entite: EntityId; cible: EntityId | null; pos: Vec3 }
  | { type: 'plongeon'; entite: EntityId }
  | { type: 'plongeon_impact'; entite: EntityId; pos: Vec3; touches: EntityId[] }
  | { type: 'mort'; victime: EntityId; tueur: EntityId | null; xp: number; pos: Vec3 }
  | { type: 'niveau'; entite: EntityId; niveau: number }
  | { type: 'palier'; entite: EntityId; rang: number; nom: string }
  | { type: 'apparition'; entite: EntityId }
