import {
  NIVEAU_MAX,
  PORTEE_AURA_PALIER_1,
  PORTEE_AURA_PALIER_2,
  PORTEE_AURA_PALIER_3,
  PV_AU_NIVEAU_MAX,
  PV_BASE,
  XP_BASE_KILL,
  XP_PAR_NIVEAU_VICTIME,
  XP_PAR_SERIE_VICTIME,
} from './constants'
import type { Entite } from './types'

/** XP a accumuler pour passer de `niveau` a `niveau + 1`. */
export function xpPourNiveau(niveau: number): number {
  return 25 + 10 * niveau
}

/**
 * §2 — "Le niveau est un score, pas une statistique."
 * L'unique effet mecanique est cette rampe de PV, volontairement plate.
 * Passer PV_AU_NIVEAU_MAX a 100 rend le niveau strictement cosmetique.
 */
export function pvMaxPourNiveau(niveau: number): number {
  if (NIVEAU_MAX <= 1) return PV_BASE
  const t = (Math.min(niveau, NIVEAU_MAX) - 1) / (NIVEAU_MAX - 1)
  return Math.round(PV_BASE + (PV_AU_NIVEAU_MAX - PV_BASE) * t)
}

/** Valeur d'une arme portee, en XP. C'est ici que passera le butin (§2). */
export function valeurEquipement(entite: Entite): number {
  return entite.arme === 'epee' ? 25 : 0
}

/**
 * §2 anti-farm : "L'XP gagne en tuant depend de ce que portait la victime et
 * de sa serie. Un joueur nu ne rapporte rien."
 * Nu niveau 1 sans serie = 35. Equipe niveau 5 avec 3 de serie = 190.
 */
export function xpDuKill(victime: Entite): number {
  return Math.round(
    XP_BASE_KILL +
      XP_PAR_NIVEAU_VICTIME * (victime.niveau - 1) +
      XP_PAR_SERIE_VICTIME * victime.serie +
      valeurEquipement(victime),
  )
}

export interface Palier {
  rang: 1 | 2 | 3
  seuil: number
  nom: string
  /** Distance a laquelle les autres joueurs percoivent l'aura.
   *  §3 PRIORITE 2 — c'est le curseur le plus important du jeu. */
  porteeAura: number
  /** Revelation sur la carte : null = ponctuelle, decrite par periode/duree. */
  revelationPermanente: boolean
  revelationPeriode: number
  revelationDuree: number
}

/** §2 — trois paliers atteignables en session courte. */
export const PALIERS: readonly Palier[] = [
  {
    rang: 1,
    seuil: 3,
    nom: 'Marque',
    porteeAura: PORTEE_AURA_PALIER_1,
    revelationPermanente: false,
    revelationPeriode: 15,
    revelationDuree: 3,
  },
  {
    rang: 2,
    seuil: 5,
    nom: 'Traqueur',
    porteeAura: PORTEE_AURA_PALIER_2,
    revelationPermanente: true,
    revelationPeriode: 0,
    revelationDuree: 0,
  },
  {
    rang: 3,
    seuil: 8,
    nom: 'Guerrier Ultime',
    porteeAura: PORTEE_AURA_PALIER_3,
    revelationPermanente: true,
    revelationPeriode: 0,
    revelationDuree: 0,
  },
]

export function palierDe(serie: number): Palier | null {
  let trouve: Palier | null = null
  for (const p of PALIERS) {
    if (serie >= p.seuil) trouve = p
  }
  return trouve
}

/** Serie a atteindre pour le palier suivant, ou null si on est au sommet. */
export function prochainPalier(serie: number): Palier | null {
  for (const p of PALIERS) {
    if (serie < p.seuil) return p
  }
  return null
}
