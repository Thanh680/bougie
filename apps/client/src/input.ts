import * as pc from 'playcanvas'
import { clamp } from '@bougie/shared'

const DEG = Math.PI / 180

/** Radians de rotation par pixel de souris. */
export const SENSIBILITE = 0.0022
const PITCH_MIN = -78 * DEG
const PITCH_MAX = 78 * DEG

/**
 * Lecture des entrees. Ce module possede le yaw et le pitch : la camera les
 * lit pour se placer, la simulation les recoit dans l'entree du joueur.
 * C'est la seule source de verite de l'orientation du regard.
 */
export class Entrees {
  yaw = 0
  pitch = -10 * DEG

  moveX = 0
  moveZ = 0
  /** Front montant, consomme par la frame. */
  saut = false
  /** Front montant : -1 esquive a gauche, 1 a droite, 0 aucune. */
  esquive = 0

  verrouille = false

  private attaqueEnAttente = false
  private specialeEnAttente = false
  private boutonEnfonce = false
  private boutonDroitEnfonce = false
  /** Fronts montants clavier en attente (repetitions du clavier filtrees). */
  private fronts: number[] = []
  /** Fronts hors deplacement, transmis au jeu (touches de debug). */
  private autresFronts: number[] = []
  private enfoncees = new Set<number>()

  private readonly app: pc.AppBase
  private readonly canvas: HTMLCanvasElement

  constructor(app: pc.AppBase, canvas: HTMLCanvasElement) {
    this.app = app
    this.canvas = canvas

    canvas.addEventListener('contextmenu', (e) => e.preventDefault())

    canvas.addEventListener('mousedown', () => {
      if (!pc.Mouse.isPointerLocked()) {
        // Le clic qui verrouille le pointeur ne doit pas declencher de coup.
        app.mouse?.enablePointerLock()
      }
    })

    app.mouse?.on(pc.EVENT_MOUSEDOWN, (e: pc.MouseEvent) => {
      if (!pc.Mouse.isPointerLocked()) return
      if (e.button === pc.MOUSEBUTTON_LEFT) {
        this.attaqueEnAttente = true
        this.boutonEnfonce = true
      } else if (e.button === pc.MOUSEBUTTON_RIGHT) {
        this.specialeEnAttente = true
        this.boutonDroitEnfonce = true
      }
    })

    app.mouse?.on(pc.EVENT_MOUSEUP, (e: pc.MouseEvent) => {
      if (e.button === pc.MOUSEBUTTON_LEFT) this.boutonEnfonce = false
      else if (e.button === pc.MOUSEBUTTON_RIGHT) this.boutonDroitEnfonce = false
    })

    app.mouse?.on(pc.EVENT_MOUSEMOVE, (e: pc.MouseEvent) => {
      if (!pc.Mouse.isPointerLocked()) return
      this.yaw -= e.dx * SENSIBILITE
      this.pitch = clamp(this.pitch - e.dy * SENSIBILITE, PITCH_MIN, PITCH_MAX)
    })

    // Le clavier repete l'evenement keydown tant que la touche est tenue : on
    // filtre pour ne garder que les vrais fronts, sinon tenir Espace declenche
    // une esquive par frame.
    app.keyboard?.on(pc.EVENT_KEYDOWN, (e: pc.KeyboardEvent) => {
      if (e.key === null || this.enfoncees.has(e.key)) return
      this.enfoncees.add(e.key)
      this.fronts.push(e.key)
    })

    app.keyboard?.on(pc.EVENT_KEYUP, (e: pc.KeyboardEvent) => {
      if (e.key !== null) this.enfoncees.delete(e.key)
    })

    document.addEventListener('pointerlockchange', () => {
      this.verrouille = pc.Mouse.isPointerLocked()
      if (!this.verrouille) {
        this.boutonEnfonce = false
        this.boutonDroitEnfonce = false
      }
    })
  }

  /** A appeler une fois par frame, avant d'alimenter la simulation. */
  lire(): void {
    this.saut = false
    this.esquive = 0

    const k = this.app.keyboard
    if (!k || !this.verrouille) {
      this.moveX = 0
      this.moveZ = 0
      this.fronts.length = 0
      return
    }

    // Le navigateur rapporte la touche SELON LA DISPOSITION : sur un clavier
    // AZERTY, la touche physique du W envoie Z et celle du A envoie Q. On accepte
    // donc les deux jeux — sur QWERTY, Z et Q ne servent a rien d'autre.
    const avant = k.isPressed(pc.KEY_W) || k.isPressed(pc.KEY_Z) || k.isPressed(pc.KEY_UP) ? 1 : 0
    const arriere = k.isPressed(pc.KEY_S) || k.isPressed(pc.KEY_DOWN) ? 1 : 0
    const gauche = k.isPressed(pc.KEY_A) || k.isPressed(pc.KEY_Q) || k.isPressed(pc.KEY_LEFT) ? 1 : 0
    const droite = k.isPressed(pc.KEY_D) || k.isPressed(pc.KEY_RIGHT) ? 1 : 0

    this.moveZ = avant - arriere
    this.moveX = droite - gauche

    // Espace + une direction PUREMENT laterale = esquive. Tout le reste = saut,
    // y compris les diagonales : avancer-gauche-Espace doit rester un saut en
    // diagonale, sinon on ne peut plus sauter en se deplacant.
    // Un appui = une action : tenir Espace ne fait rien.
    for (const touche of this.fronts) {
      if (touche !== pc.KEY_SPACE) {
        this.autresFronts.push(touche)
        continue
      }
      if (this.moveX !== 0 && this.moveZ === 0) this.esquive = this.moveX
      else this.saut = true
    }
    this.fronts.length = 0
  }

  /**
   * Un clic = un coup, a l'appui. Maintenir ne relance PAS le coup : le
   * maintien sert maintenant a armer le coup lourd, et les deux usages ne
   * peuvent pas coexister sur le meme bouton.
   */
  veutAttaquer(): boolean {
    if (!this.verrouille) {
      this.attaqueEnAttente = false
      return false
    }
    if (this.attaqueEnAttente) {
      this.attaqueEnAttente = false
      return true
    }
    return false
  }

  /** Etat continu du bouton : c'est lui qui arme le coup lourd. */
  get attaqueMaintenue(): boolean {
    return this.verrouille && this.boutonEnfonce
  }

  /** Front montant du clic droit : l'action speciale de l'arme. */
  veutSpeciale(): boolean {
    if (!this.verrouille) {
      this.specialeEnAttente = false
      return false
    }
    if (this.specialeEnAttente) {
      this.specialeEnAttente = false
      return true
    }
    return false
  }

  /** Etat continu du clic droit : maintenu, le tourbillon enchaine ses tours. */
  get specialeMaintenue(): boolean {
    return this.verrouille && this.boutonDroitEnfonce
  }

  /** Consomme les fronts clavier hors deplacement (touches de debug). */
  consommerFronts(): number[] {
    if (this.autresFronts.length === 0) return this.autresFronts
    const f = this.autresFronts
    this.autresFronts = []
    return f
  }

  demanderVerrou(): void {
    if (!pc.Mouse.isPointerLocked()) this.app.mouse?.enablePointerLock()
    this.canvas.focus()
  }
}
