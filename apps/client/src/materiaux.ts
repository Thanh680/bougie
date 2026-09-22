import * as pc from 'playcanvas'

/**
 * §5 — ombrage tres simple. Un eclairage PBR sur du low poly annule l'effet
 * et coute cher. Ici : diffuse plat + emissive pour tout ce qui doit "briller".
 */
export function materiau(options: {
  diffuse?: pc.Color
  emissive?: pc.Color
  emissiveIntensite?: number
  opacite?: number
  additif?: boolean
  culFace?: number
  ecritProfondeur?: boolean
}): pc.StandardMaterial {
  const m = new pc.StandardMaterial()
  m.diffuse = options.diffuse ?? new pc.Color(0.8, 0.8, 0.8)
  m.emissive = options.emissive ?? new pc.Color(0, 0, 0)
  if (options.emissiveIntensite !== undefined) m.emissiveIntensity = options.emissiveIntensite
  m.useMetalness = false
  m.specular = new pc.Color(0.05, 0.05, 0.05)

  if (options.additif) {
    m.blendType = pc.BLEND_ADDITIVE
    m.depthWrite = false
  } else if (options.opacite !== undefined && options.opacite < 1) {
    m.blendType = pc.BLEND_NORMAL
    m.depthWrite = options.ecritProfondeur ?? false
  }
  if (options.opacite !== undefined) m.opacity = options.opacite
  if (options.culFace !== undefined) m.cull = options.culFace

  m.update()
  return m
}

/** Applique un materiau a toutes les mesh instances d'une entite. */
export function appliquerMateriau(entite: pc.Entity, m: pc.Material): void {
  const render = entite.render
  if (!render) return
  for (const mi of render.meshInstances) mi.material = m
}

/**
 * Damier procedural pour le sol.
 * §5 — filtrage NEAREST en magnification : sinon une texture basse resolution
 * devient floue au lieu de rester nette. On garde un mipmap lineaire en
 * minification, sinon le sol scintille des qu'on s'eloigne.
 */
export function textureGrille(device: pc.GraphicsDevice): pc.Texture {
  const taille = 128
  const canvas = document.createElement('canvas')
  canvas.width = taille
  canvas.height = taille
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D indisponible')

  ctx.fillStyle = '#3d4352'
  ctx.fillRect(0, 0, taille, taille)

  // Sous-grille au metre (4 cases par tuile de 4 m).
  ctx.strokeStyle = '#495063'
  ctx.lineWidth = 2
  for (let i = 1; i < 4; i++) {
    const p = (i * taille) / 4
    ctx.beginPath()
    ctx.moveTo(p, 0)
    ctx.lineTo(p, taille)
    ctx.moveTo(0, p)
    ctx.lineTo(taille, p)
    ctx.stroke()
  }

  // Bord de tuile, plus marque : c'est lui qui donne la sensation de vitesse.
  ctx.strokeStyle = '#5b6479'
  ctx.lineWidth = 6
  ctx.strokeRect(0, 0, taille, taille)

  const texture = new pc.Texture(device, {
    name: 'grille-sol',
    width: taille,
    height: taille,
    mipmaps: true,
    addressU: pc.ADDRESS_REPEAT,
    addressV: pc.ADDRESS_REPEAT,
    magFilter: pc.FILTER_NEAREST,
    minFilter: pc.FILTER_NEAREST_MIPMAP_LINEAR,
  })
  texture.anisotropy = 8 // sans ca le sol moire violemment en vision rasante
  texture.setSource(canvas)
  return texture
}
