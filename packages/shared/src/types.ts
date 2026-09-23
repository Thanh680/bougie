import type { Vec3 } from './math'

export type EntityId = number

export type Espece = 'joueur' | 'mannequin'

export type ArmeId = 'poings' | 'epee' | 'hache'

export type EtatPlongeon = 'aucun' | 'suspension' | 'chute'

export type EtatRuee = 'aucun' | 'course'

export type TypeAttaque = 'aucun' | 'normal' | 'lourd' | 'tour'

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
  /**
   * Front montant du clic droit, consomme par la sim : l'action speciale de
   * l'arme. Ruee a l'epee, tourbillon a la hache, rien aux poings.
   */
  speciale: boolean
  /** Etat continu du clic droit : maintenu, le tourbillon enchaine ses tours. */
  specialeMaintenue: boolean
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
    speciale: false,
    specialeMaintenue: false,
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
   *  qu'une projection de coup lourd ne soit pas rabotee en plein vol. */
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
  /** Pas de saut avant cette date : pendant le coup lourd qui conclut une ruee. */
  sautInterditJusqua: number

  /** Date a laquelle le bouton d'attaque a ete enfonce, ou -99. */
  maintienDepuis: number
  /** Le maintien en cours a deja donne son coup lourd : il n'en donnera pas
   *  d'autre, et son relachement ne declenchera pas de coup normal. */
  lourdPendantCeMaintien: boolean
  dernierLourdA: number

  // Attaque en vol : lancee, pas encore resolue. Annulee si on encaisse.
  attaqueEnCours: TypeAttaque
  attaqueImpactA: number
  /** Date de la derniere annulation. Sert au rendu : un coup annule ne doit
   *  jamais jouer sa frappe. */
  attaqueAnnuleeA: number

  // Enchainement de coups normaux (longue hache)
  /** Rang du dernier coup normal dans l'enchainement (0, 1, 2) ; -1 apres tout
   *  autre coup, ou quand on encaisse. */
  comboEtape: number
  /** Clic recu pendant un coup de l'enchainement : le suivant part a sa fin. */
  coupEnAttente: boolean

  // Tourbillon (clic droit de la longue hache)
  /** Rang du tour en cours, de 1 a TOUR_MAX ; 0 hors tourbillon. */
  tourbillon: number
  /** Un clic pendant ce tour a demande le suivant. */
  tourDemande: boolean
  dernierTourA: number

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
  /** Fin de l'animation d'attaque en cours : aucun nouveau coup avant. La jauge
   *  sous le reticule se remplit de `dernierCoupA` jusqu'a cette date. */
  finSwing: number
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
  | { type: 'coup'; attaquant: EntityId; cible: EntityId; degats: number; pos: Vec3 }
  | { type: 'coup_vide'; attaquant: EntityId }
  | { type: 'esquive'; entite: EntityId; direction: number }
  | { type: 'coup_lourd'; attaquant: EntityId; cible: EntityId | null }
  | { type: 'attaque_lancee'; entite: EntityId; attaque: 'normal' | 'lourd' | 'tour' }
  | { type: 'attaque_annulee'; entite: EntityId }
  | { type: 'ruee'; entite: EntityId }
  | { type: 'ruee_impact'; entite: EntityId; cible: EntityId | null; pos: Vec3 }
  | { type: 'plongeon'; entite: EntityId }
  | { type: 'plongeon_impact'; entite: EntityId; pos: Vec3; touches: EntityId[] }
  | { type: 'mort'; victime: EntityId; tueur: EntityId | null; xp: number; pos: Vec3 }
  | { type: 'niveau'; entite: EntityId; niveau: number }
  | { type: 'palier'; entite: EntityId; rang: number; nom: string }
  | { type: 'apparition'; entite: EntityId }
