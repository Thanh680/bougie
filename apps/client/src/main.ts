import './style.css'
import * as pc from 'playcanvas'
import { CARTE_ARENE_VIDE, NB_MANNEQUINS, World } from '@bougie/shared'
import { Acteurs } from './acteurs'
import { CameraTPS } from './camera'
import { Entrees } from './input'
import { Hud } from './hud'
import { Scene } from './scene'

/**
 * §7 — Semaine 1 : la sensation, en local, avec des capsules.
 * Aucun reseau, aucune animation, aucun modele. La question est unique :
 * est-ce que le combat est agreable ?
 *
 * La simulation vit dans @bougie/shared et ne sait rien de PlayCanvas. Le jour
 * ou le serveur arrive, c'est exactement ce meme World qui tourne cote serveur
 * et ce fichier ne fait plus que lire les entrees et dessiner (§4).
 */

const canvas = document.getElementById('app') as HTMLCanvasElement
const conteneurHud = document.getElementById('hud') as HTMLElement

const app = new pc.Application(canvas, {
  mouse: new pc.Mouse(canvas),
  keyboard: new pc.Keyboard(window),
  graphicsDeviceOptions: { antialias: true, alpha: false },
})
app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW)
app.setCanvasResolution(pc.RESOLUTION_AUTO)
window.addEventListener('resize', () => app.resizeCanvas())

const monde = new World(CARTE_ARENE_VIDE)
const moi = monde.creerJoueur('Vous')
for (let i = 0; i < NB_MANNEQUINS; i++) monde.creerMannequin(`Mannequin ${i + 1}`)

const scene = new Scene(app, monde.carte)
const camera = new CameraTPS(app)
const acteurs = new Acteurs(app)
const entrees = new Entrees(app, canvas)
const hud = new Hud(conteneurHud)

entrees.yaw = moi.yaw
const positionCamera = new pc.Vec3()

app.on('update', (dt: number) => {
  // 1. Entrees -> intentions. Jamais de position envoyee par le client (§4).
  entrees.lire()
  const cmd = monde.entree(moi.id)
  cmd.seq++
  cmd.moveX = entrees.moveX
  cmd.moveZ = entrees.moveZ
  cmd.yaw = entrees.yaw
  cmd.pitch = entrees.pitch
  if (entrees.saut) cmd.saut = true
  if (entrees.esquive !== 0) cmd.esquive = entrees.esquive
  // Une seule entree d'attaque : la simulation distingue elle-meme le clic
  // bref (coup normal) du maintien (coup lourd).
  cmd.attaqueMaintenue = entrees.attaqueMaintenue
  if (entrees.veutRuer()) cmd.ruee = true

  appliquerTouchesDebug()

  // 2. Simulation autoritaire.
  monde.avancer(dt)

  // 3. Rendu.
  acteurs.consommer(monde.evenements)
  acteurs.maj(monde, moi.id, dt)
  const rendu = acteurs.positionRendu(moi.id)
  positionCamera.set(rendu?.x ?? moi.pos.x, rendu?.y ?? moi.pos.y, rendu?.z ?? moi.pos.z)
  const esquiveEnCours = monde.temps < moi.finEsquive ? moi.directionEsquive : 0
  camera.maj(positionCamera, entrees.yaw, entrees.pitch, esquiveEnCours, dt)
  scene.dessiner()

  // 4. Interface. Les evenements sont consommes puis vides a la fin de la frame.
  hud.consommer(monde, monde.evenements, moi.id, camera)
  hud.maj(monde, moi, camera.entity, canvas, dt)
  hud.afficherPause(!entrees.verrouille)
  monde.evenements.length = 0
})

/**
 * Touches de debug du prototype.
 * L'epee ne se ramasse nulle part : il n'y a ni barils ni coffres sur une map
 * vide (§2). En attendant, on la donne a la main pour pouvoir tester le combat,
 * qui est le chemin critique (§9).
 */
function appliquerTouchesDebug(): void {
  for (const touche of entrees.consommerFronts()) {
    if (touche === pc.KEY_1) moi.arme = 'poings'
    else if (touche === pc.KEY_2) moi.arme = 'epee'
    else if (touche === pc.KEY_K) monde.forcerMort(moi.id)
  }
}

app.start()

// Point d'entree d'inspection en dev : `__arene.monde`, `__arene.moi`, etc.
// depuis la console du navigateur. Retire du bundle de production.
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>)['__arene'] = {
    pc,
    app,
    monde,
    moi,
    camera,
    acteurs,
    entrees,
    hud,
  }
}
