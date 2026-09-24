import areneVide from './maps/arene-vide.json'

/**
 * §6 — les niveaux sont decrits en JSON, pas en fichier de scene binaire.
 * Diffable, fusionnable, lisible en pull request, et surtout : le serveur Node
 * lit exactement le meme fichier que le client, donc la geometrie ne peut pas diverger.
 */
export interface Carte {
  nom: string
  version: number
  forme: 'cercle'
  rayon: number
  hauteurSol: number
  gradient: {
    /** §2 gradient spatial : centre = demons, coffres, meilleures recompenses. */
    rayonCentre: number
    /** Au-dela : monstres faibles, butin basique, peu de joueurs. */
    rayonPeripherie: number
  }
  apparitions: { x: number; z: number }[]
  /** Mannequins de test : prototype uniquement, pour mesurer les degats. */
  essais?: { x: number; z: number }[]
  obstacles: unknown[]
}

export const CARTE_ARENE_VIDE = areneVide as Carte
