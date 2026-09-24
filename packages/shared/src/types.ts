import type { Vec3 } from './math'

export type EntityId = number

/** 'essai' : mannequin de test. Ne bouge pas, ne frappe pas, ne meurt pas ; il compte les degats. */
export type Espece = 'joueur' | 'mannequin' | 'essai'

export type ArmeId = 'poings' | 'epee' | 'hache' | 'doubleEpee' | 'marteau'

export type EtatPlongeon = 'aucun' | 'suspension' | 'chute'

export type EtatRuee = 'aucun' | 'course'

/**
 * 'uppercut' et 'fauche' : clic droit et clic en l'air de la double epee.
 * 'sautee' et 'ecrasement' : clic en l'air et charge relachee du marteau.
 */
export type TypeAttaque = 'aucun' | 'normal' | 'lourd' | 'tour' | 'uppercut' | 'fauche' | 'sautee' | 'ecrasement'

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
   * l'arme. Ruee a l'epee, tourbillon a la hache, uppercut a la double epee,
   * charge au marteau, rien aux poings.
   */
  speciale: boolean
  /** Etat continu du clic droit : maintenu, le tourbillon enchaine ses tours
   *  et le marteau reste en charge. */
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
  /** Entre 0 et STAMINA_MAX. L'esquive la consomme, et les coups speciaux de
   *  la double epee et du marteau aussi. */
  stamina: number

  /** Vitesse bridee a MULT_RALENTI jusqu'a cette date. Annule par une esquive. */
  ralentiJusqua: number
  /** Petite ruee d'un coup de hache en cours jusqu'a cette date. */
  elanJusqua: number
  /** Fenetre pendant laquelle le plafond de vitesse ne s'applique pas, pour
   *  qu'une projection de coup lourd ne soit pas rabotee en plein vol. */
  finPoussee: number

  // Etourdissement : ni deplacement ni attaque. Une esquive en sort, mais pas
  // avant STUN_DELAI_AVANT_ESQUIVE.
  stunJusqua: number
  stunDepuis: number

  /** Attaque sautee : suspension en l'air, puis chute a la verticale (epee) ou en avant (hache). */
  plongeon: EtatPlongeon
  finSuspension: number
  /** Vitesse imposee pendant la chute, calculee a la fin de la suspension. */
  plongeonVitesse: Vec3
  /** Date du dernier impact de plongeon. Sert au rendu a distinguer une
   *  recuperation de plongeon d'une recuperation de coup lourd. */
  dernierPlongeonA: number
  /** Apres l'impact : plus aucun controle jusqu'a cette date. */
  finRecuperation: number
  /** Pas de saut avant cette date : pendant le coup lourd qui conclut une ruee. */
  sautInterditJusqua: number
  /** Ni deplacement, ni saut, ni esquive jusqu'a cette date : les coups du marteau. */
  immobileJusqua: number

  /** Date a laquelle le bouton d'attaque a ete enfonce, ou -99. */
  maintienDepuis: number
  /** Le maintien en cours a deja donne son coup — le coup lourd, ou le coup
   *  normal d'une arme qui n'en a pas : il n'en donnera pas d'autre, et son
   *  relachement ne declenchera pas de coup normal. */
  lourdPendantCeMaintien: boolean
  dernierLourdA: number
  /** Coup fort de la double epee pris dans le dos : date du premier coup, -99
   *  sinon. Sert au rendu du second coup. */
  coupDosA: number

  // Attaque en vol : lancee, pas encore resolue. Annulee si on encaisse.
  attaqueEnCours: TypeAttaque
  /** Type du dernier coup lance, qu'il ait porte ou non. Sert au rendu. */
  typeDernierCoup: TypeAttaque
  /** Prochain impact de l'attaque en vol : un geste double en porte deux. */
  attaqueImpactA: number
  impactsFaits: number
  /** Nombre d'impacts de l'attaque en vol. */
  impactsPrevus: number
  /** Touchees par le premier impact du geste : le second les frappe encore,
   *  malgre l'invulnerabilite que le premier vient de leur donner. */
  touchesGeste: EntityId[]
  /** Date de la derniere annulation. Sert au rendu : un coup annule ne doit
   *  jamais jouer sa frappe. */
  attaqueAnnuleeA: number

  // Enchainement de coups normaux (longue hache, double epee)
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

  // Coups aeriens de la double epee et du marteau
  /** Fauchage aerien : suspendu en l'air jusqu'a cette date, le temps du geste. */
  suspenduJusqua: number
  /** Apres un fauchage aerien : plus aucun controle jusqu'au sol. */
  chuteLibre: boolean
  /** Un coup aerien est deja parti pendant ce saut : un seul par saut. */
  attaqueAerienne: boolean

  // Charge du marteau (clic droit maintenu)
  /** Debut de la charge en cours, -99 hors charge. */
  chargeDepuis: number
  /** Niveau de la derniere charge relachee, de 0 a 1 : les degats de l'ecrasement. */
  niveauCharge: number

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
  /** Mannequin de test uniquement. */
  mesure?: EtatMesure
}

/**
 * Compteur du mannequin de test. Il additionne tout ce qu'il encaisse, et se
 * remet a zero — et a son poste — quand on arrete de le frapper.
 */
export interface EtatMesure {
  poste: Vec3
  degats: number
  coups: number
  premierCoupA: number
  dernierCoupA: number
  /** Date a laquelle les degats ont atteint ses PV : le temps pour tuer. -99 sinon. */
  koA: number
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
  | { type: 'coup_lourd'; attaquant: EntityId; touches: EntityId[] }
  | { type: 'coup_dos'; attaquant: EntityId; cible: EntityId }
  | { type: 'attaque_lancee'; entite: EntityId; attaque: Exclude<TypeAttaque, 'aucun'> }
  | { type: 'attaque_annulee'; entite: EntityId }
  | { type: 'stamina_insuffisante'; entite: EntityId }
  | { type: 'charge'; entite: EntityId }
  | { type: 'ecrasement_impact'; entite: EntityId; pos: Vec3; rayon: number; touches: EntityId[] }
  | { type: 'ruee'; entite: EntityId }
  | { type: 'ruee_impact'; entite: EntityId; cible: EntityId | null; pos: Vec3 }
  | { type: 'plongeon'; entite: EntityId }
  | { type: 'plongeon_impact'; entite: EntityId; pos: Vec3; touches: EntityId[] }
  | { type: 'mort'; victime: EntityId; tueur: EntityId | null; xp: number; pos: Vec3 }
  | { type: 'niveau'; entite: EntityId; niveau: number }
  | { type: 'palier'; entite: EntityId; rang: number; nom: string }
  | { type: 'apparition'; entite: EntityId }
