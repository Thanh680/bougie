import * as pc from 'playcanvas'
import { HAUTEUR_ENTITE, RAYON_ENTITE } from '@bougie/shared'

/**
 * Les primitives du composant `render` ne prennent pas de dimensions : la
 * capsule par defaut fait 0.3 de rayon pour 1.0 de haut. On construit donc le
 * maillage a la main, aux dimensions EXACTES de la simulation : sinon la
 * hitbox et ce qu'on voit divergent, et le combat devient illisible.
 */
let capsuleJoueur: pc.Mesh | null = null

export function meshCapsuleJoueur(device: pc.GraphicsDevice): pc.Mesh {
  if (!capsuleJoueur) {
    capsuleJoueur = pc.Mesh.fromGeometry(
      device,
      new pc.CapsuleGeometry({ radius: RAYON_ENTITE, height: HAUTEUR_ENTITE, sides: 16 }),
    )
  }
  return capsuleJoueur
}

export function entiteMaillage(nom: string, mesh: pc.Mesh, materiau: pc.Material): pc.Entity {
  const e = new pc.Entity(nom)
  e.addComponent('render', { meshInstances: [new pc.MeshInstance(mesh, materiau)] })
  return e
}
