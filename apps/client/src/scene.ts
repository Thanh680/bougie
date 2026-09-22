import * as pc from 'playcanvas'
import type { Carte } from '@bougie/shared'
import { appliquerMateriau, materiau, textureGrille } from './materiaux'

/** Anneaux dessines en mode immediat : pas de mesh a construire, cout nul. */
interface Anneau {
  points: pc.Vec3[]
  couleur: pc.Color
}

export class Scene {
  private readonly app: pc.AppBase
  private readonly anneaux: Anneau[] = []

  constructor(app: pc.AppBase, carte: Carte) {
    this.app = app

    app.scene.ambientLight = new pc.Color(0.17, 0.19, 0.25)

    const soleil = new pc.Entity('soleil')
    soleil.addComponent('light', {
      type: 'directional',
      color: new pc.Color(1, 0.94, 0.84),
      intensity: 1.35,
      castShadows: true,
      // Carte d'ombre serree autour du joueur : a 90 m elle est si etiree
      // qu'elle produit des bandes visibles sur le sol.
      shadowDistance: 45,
      shadowResolution: 2048,
      shadowBias: 0.03,
      normalOffsetBias: 0.05,
    })
    soleil.setEulerAngles(52, 34, 0)
    app.root.addChild(soleil)

    // Contre-jour froid : sans lui les capsules se fondent dans le sol de dos.
    const appoint = new pc.Entity('appoint')
    appoint.addComponent('light', {
      type: 'directional',
      color: new pc.Color(0.42, 0.52, 0.78),
      intensity: 0.35,
      castShadows: false,
    })
    appoint.setEulerAngles(28, -150, 0)
    app.root.addChild(appoint)

    // --- Sol ---------------------------------------------------------------
    const cote = carte.rayon * 2.4
    const sol = new pc.Entity('sol')
    sol.addComponent('render', { type: 'plane', castShadows: false })
    sol.setLocalScale(cote, 1, cote)
    sol.setPosition(0, carte.hauteurSol, 0)
    const matSol = materiau({ diffuse: new pc.Color(1, 1, 1) })
    matSol.diffuseMap = textureGrille(app.graphicsDevice)
    matSol.diffuseMapTiling = new pc.Vec2(cote / 4, cote / 4)
    matSol.update()
    appliquerMateriau(sol, matSol)
    app.root.addChild(sol)

    // --- Mur de l'arene ----------------------------------------------------
    // Une palissade de lumiere, pas un cylindre : un cylindre est ferme, son
    // capuchon du haut recouvre tout le ciel et celui du bas se bat en
    // profondeur avec le sol. Des segments verticaux ne coutent rien et se lisent
    // aussi bien.
    this.anneaux.push({
      points: palissade(carte.rayon, carte.hauteurSol, 3.2, 96),
      couleur: new pc.Color(0.24, 0.42, 0.72),
    })
    this.anneaux.push({
      points: cercle(carte.rayon, carte.hauteurSol + 3.2, 128),
      couleur: new pc.Color(0.3, 0.5, 0.82),
    })

    // --- Anneaux du gradient spatial (§2) ----------------------------------
    // Peripherie = monstres faibles et butin basique, centre = les recompenses.
    // Rien de tout cela n'existe encore : les anneaux marquent juste les zones
    // pour qu'on lise ou on se trouve dans l'arene.
    this.anneaux.push({
      points: cercle(carte.gradient.rayonCentre, carte.hauteurSol + 0.03, 72),
      couleur: new pc.Color(0.95, 0.45, 0.25),
    })
    this.anneaux.push({
      points: cercle(carte.gradient.rayonPeripherie, carte.hauteurSol + 0.03, 96),
      couleur: new pc.Color(0.35, 0.55, 0.8),
    })
    this.anneaux.push({
      points: cercle(carte.rayon, carte.hauteurSol + 0.03, 128),
      couleur: new pc.Color(0.3, 0.45, 0.75),
    })
  }

  /** A appeler chaque frame : le mode immediat ne persiste pas. */
  dessiner(): void {
    for (const a of this.anneaux) this.app.drawLines(a.points, a.couleur)
  }
}

/** Barreaux verticaux regulierement repartis sur un cercle. */
function palissade(rayon: number, y: number, hauteur: number, barreaux: number): pc.Vec3[] {
  const points: pc.Vec3[] = []
  for (let i = 0; i < barreaux; i++) {
    const a = (i / barreaux) * Math.PI * 2
    const x = Math.cos(a) * rayon
    const z = Math.sin(a) * rayon
    points.push(new pc.Vec3(x, y, z))
    points.push(new pc.Vec3(x, y + hauteur, z))
  }
  return points
}

/** Boucle fermee de segments, prete pour `drawLines` (paires de points). */
function cercle(rayon: number, y: number, segments: number): pc.Vec3[] {
  const points: pc.Vec3[] = []
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2
    const a1 = ((i + 1) / segments) * Math.PI * 2
    points.push(new pc.Vec3(Math.cos(a0) * rayon, y, Math.sin(a0) * rayon))
    points.push(new pc.Vec3(Math.cos(a1) * rayon, y, Math.sin(a1) * rayon))
  }
  return points
}
