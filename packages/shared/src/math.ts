/**
 * Maths minimales pour la simulation.
 *
 * Aucune dependance moteur : ce paquet doit pouvoir tourner tel quel dans Node
 * cote serveur (§4 — la sim est ecrite une seule fois pour les deux cotes).
 *
 * Convention de yaw, identique a PlayCanvas :
 *   yaw = 0        ->  avant = (0, 0, -1)
 *   yaw croissant  ->  on tourne vers la GAUCHE (vu de dessus)
 * Le client peut donc faire `entity.setEulerAngles(0, yaw * RAD_TO_DEG, 0)` sans conversion.
 */

export interface Vec3 {
  x: number
  y: number
  z: number
}

export function v3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z }
}

export function copieV3(v: Vec3): Vec3 {
  return { x: v.x, y: v.y, z: v.z }
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Amortissement exponentiel : meme resultat quel que soit le framerate. */
export function amortir(actuel: number, cible: number, vitesse: number, dt: number): number {
  return lerp(actuel, cible, 1 - Math.exp(-vitesse * dt))
}

/** Vecteur avant correspondant a un yaw. */
export function avant(yaw: number): Vec3 {
  return { x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) }
}

/** Vecteur droite correspondant a un yaw. */
export function droite(yaw: number): Vec3 {
  return { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) }
}

export function distanceXZ(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

export function longueurXZ(v: Vec3): number {
  return Math.hypot(v.x, v.z)
}

/** Yaw qui pointe de `depuis` vers `vers`. Meme convention que `avant()`. */
export function yawVers(depuis: Vec3, vers: Vec3): number {
  return Math.atan2(-(vers.x - depuis.x), -(vers.z - depuis.z))
}

/** Ecart signe le plus court entre deux yaws, dans [-PI, PI]. */
export function deltaAngle(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}
