import { ARMES } from './combat'
import { MANNEQUIN_PORTEE_AGGRO } from './constants'
import { distanceXZ, yawVers } from './math'
import type { Entite } from './types'

/**
 * Mannequins d'entrainement — prototype uniquement.
 *
 * Ce n'est PAS le PvE du jeu : §3 laisse ouvert le role du PvE (source d'XP,
 * source de butin, ou obstacle qui expose). Ces mannequins existent seulement
 * pour repondre a la question de la semaine 1 : est-ce que le combat est agreable ?
 * Ils avancent, ils strafent, ils rendent les coups. Rien de plus.
 */
export function majIA(temps: number, e: Entite, candidats: Iterable<Entite>): void {
  const ia = e.ia
  if (!ia) return
  const entree = e.entree

  let cible: Entite | null = null
  let meilleure = MANNEQUIN_PORTEE_AGGRO
  for (const c of candidats) {
    if (c === e || !c.vivant || c.espece !== 'joueur') continue
    const d = distanceXZ(e.pos, c.pos)
    if (d < meilleure) {
      meilleure = d
      cible = c
    }
  }

  if (!cible) {
    ia.cible = 0
    entree.moveX = 0
    entree.moveZ = 0
    entree.attaqueMaintenue = false
    return
  }

  ia.cible = cible.id
  entree.yaw = yawVers(e.pos, cible.pos)

  const arme = ARMES[e.arme]
  const d = meilleure

  // Changement de sens du strafe de temps en temps, sinon le mannequin est
  // parfaitement lisible et le test de combat perd tout son interet.
  if (temps >= ia.prochaineDecision) {
    ia.prochaineDecision = temps + 0.8 + Math.random() * 1.6
    ia.biaisStrafe = Math.random() < 0.5 ? -1 : 1
  }

  const porteeConfort = arme.portee * 0.85
  entree.moveZ = d > porteeConfort ? 1 : d < 1.5 ? -0.7 : 0
  entree.moveX = ia.biaisStrafe * (d < porteeConfort * 1.6 ? 0.6 : 0.2)
  entree.saut = false
  entree.esquive = 0

  // Frappe des que son coup precedent est termine, apres un delai de reaction.
  // Ce delai n'est pas une facilite : sans lui un mannequin sort un DPS parfait
  // et tue un joueur nu en 4 s, ce qui transforme le bac a sable en course a la
  // survie et empeche justement de juger le combat.
  // Le mannequin ne fait que des clics brefs : un tick d'appui, donc un coup
  // normal. Pas de coup lourd — ce serait un partenaire d'entrainement trop dur.
  const pret = temps >= e.finSwing && temps >= ia.prochaineAttaque
  entree.attaqueMaintenue = !entree.attaqueMaintenue && pret && d <= arme.portee * 0.95
  if (entree.attaqueMaintenue) {
    ia.prochaineAttaque = temps + arme.dureeSwing + DELAI_REACTION_MIN + Math.random() * DELAI_REACTION_VARIATION
  }
}

const DELAI_REACTION_MIN = 0.35
const DELAI_REACTION_VARIATION = 0.5
