import * as pc from 'playcanvas'
import { amortir } from '@bougie/shared'

const RAD_TO_DEG = 180 / Math.PI

/**
 * Camera 3e personne facon Marvel Rivals.
 *
 * Caracteristiques du genre, dans l'ordre d'importance :
 *  - le corps suit toujours le yaw camera (on strafe, on ne pivote pas),
 *  - la camera est decalee sur l'epaule droite, le perso occupe la gauche du cadre,
 *  - reticule fixe au centre, la camera vise, pas le personnage,
 *  - distance courte et FOV large : on voit ses propres pieds et ses flancs.
 *
 * Ce choix n'est pas cosmetique : §4 rappelle que la formation des coalitions
 * repose entierement sur le fait de voir l'aura du leader de loin. La 1re
 * personne ferait tomber le FOV a ~90 deg et tuerait l'information.
 */
const DISTANCE = 4
const EPAULE = 0.85
const HAUTEUR_PIVOT = 1.45
const HAUTEUR_OFFSET = 0.1
const FOV = 70
/** Inclinaison de la camera pendant une esquive. Discrete : c'est ce qui donne
 *  au dash son poids sans deregler la visee. */
const ROULIS_ESQUIVE = 4.5
const LISSAGE_ROULIS = 12
const Y_MINI = 0.45

export class CameraTPS {
  readonly entity: pc.Entity

  private readonly pivot = new pc.Vec3()
  private roulis = 0
  private secousse = 0

  private readonly rot = new pc.Quat()
  private readonly offset = new pc.Vec3()
  private readonly position = new pc.Vec3()

  constructor(app: pc.AppBase) {
    this.entity = new pc.Entity('camera')
    this.entity.addComponent('camera', {
      clearColor: new pc.Color(0.06, 0.07, 0.1),
      fov: FOV,
      nearClip: 0.1,
      farClip: 400,
    })
    app.root.addChild(this.entity)
  }

  /** Petit coup de camera quand on encaisse. Assez pour que le coup se sente. */
  encaisse(): void {
    this.secousse = 1
  }

  /** `esquive` vaut -1 / 1 pendant un dash lateral, 0 sinon. */
  maj(cible: pc.Vec3, yaw: number, pitch: number, esquive: number, dt: number): void {
    // Le pivot suit EXACTEMENT la position rendue du joueur. Un second lissage
    // ici s'ajouterait a celui des acteurs : les deux cumules faisaient 74 ms de
    // retard, ressentis comme un temps mort au demarrage et au changement de sens.
    // Le sol est plat, il n'y a aucune marche a absorber.
    this.pivot.set(cible.x, cible.y + HAUTEUR_PIVOT, cible.z)

    this.roulis = amortir(this.roulis, -esquive * ROULIS_ESQUIVE, LISSAGE_ROULIS, dt)

    this.secousse = Math.max(0, this.secousse - dt * 6)
    const kick = this.secousse * this.secousse * 1.6

    this.rot.setFromEulerAngles(
      pitch * RAD_TO_DEG - kick,
      yaw * RAD_TO_DEG,
      this.roulis + this.secousse * this.secousse * 2.2,
    )

    // Offset exprime dans le repere camera : +X epaule droite, +Z vers l'arriere.
    this.offset.set(EPAULE, HAUTEUR_OFFSET, DISTANCE)
    this.rot.transformVector(this.offset, this.offset)

    this.position.set(
      this.pivot.x + this.offset.x,
      Math.max(Y_MINI, this.pivot.y + this.offset.y),
      this.pivot.z + this.offset.z,
    )

    this.entity.setPosition(this.position)
    this.entity.setRotation(this.rot)
  }
}
