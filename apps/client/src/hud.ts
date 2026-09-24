import * as pc from 'playcanvas'
import {
  ARMES,
  COUT_ESQUIVE,
  DELAI_REAPPARITION,
  HAUTEUR_ENTITE,
  STAMINA_MAX,
  STUN_DELAI_AVANT_ESQUIVE,
  VITESSE_COURSE,
  chargeEnCours,
  jaugeCoup,
  palierDe,
  prochainPalier,
  xpPourNiveau,
  type Entite,
  type EntityId,
  type Evenement,
  type World,
} from '@bougie/shared'

const GABARIT = `
  <div class="vignette" data-vignette></div>
  <div class="plaques" data-plaques></div>
  <div class="chiffres" data-chiffres></div>

  <div class="reticule" data-reticule>
    <span class="croix"></span>
    <span class="marqueur" data-marqueur></span>
    <div class="jauge-coup"><i data-coup></i></div>
    <div class="vitesse"><b data-vitesse>0.0</b> m/s <span data-pic></span></div>
    <div class="arme-lourd" data-arme-lourd hidden>ATTAQUE ANNULEE</div>
    <div class="coup-dos" data-coup-dos hidden>DANS LE DOS</div>
    <div class="etourdi" data-etourdi hidden>
      <b>ETOURDI</b>
      <span data-sortie></span>
    </div>
  </div>

  <div class="feed" data-feed></div>

  <div class="coin bas-gauche">
    <div class="serie-bloc">
      <span class="serie-valeur" data-serie>0</span>
      <span class="serie-label">serie en cours</span>
      <span class="palier" data-palier></span>
    </div>
    <div class="barre pv"><i data-pv></i><span data-pv-txt></span></div>
    <div class="barre stamina" data-stamina><i data-stamina-niveau></i></div>
    <div class="barre xp"><i data-xp></i></div>
    <div class="ligne-infos">
      <span data-niveau>Niveau 1</span>
      <span class="sep">/</span>
      <span data-arme>Poings</span>
    </div>
  </div>

  <div class="coin haut-droite" data-stats></div>

  <div class="mort" data-mort hidden>
    <h1>ELIMINE</h1>
    <p>Retour niveau 1, sans equipement.</p>
    <span data-compte></span>
  </div>

  <div class="pause" data-pause>
    <h1>Cliquez pour jouer</h1>
    <ul>
      <li><b>ZQSD / WASD</b> se deplacer &nbsp; <b>Espace</b> sauter</li>
      <li><b>D + Espace</b> / <b>Q + Espace</b> (sans avancer ni reculer) esquiver — deplacement pur, pas d'invulnerabilite. <b>Coute la moitie de la stamina</b>, qui se regenere.</li>
      <li><b>Clic bref</b> = coup normal. <b>Clic maintenu</b> = un coup lourd, lent, qui projette et etourdit mais ralentit.</li>
      <li>Aucune attaque n'est instantanee : <b>encaisser un coup annule la votre</b>.</li>
      <li><b>Clic droit</b> : a l'epee, ruee en ligne droite, toujours conclue par un coup lourd. A la hache, <b>tourbillon</b> : un tour par clic ou tant qu'on maintient, 3 d'affilee max, le dernier repousse.</li>
      <li><b>Longue hache</b> : chaque coup avance d'un pas ; recliquer pendant un coup enchaine le suivant, jusqu'a 3 ; le 3e projette.</li>
      <li><b>Double epee</b> : 3 gestes (le 3e fait trebucher) ; coup lourd qui frappe deux fois <b>dans le dos</b> ; clic droit = <b>uppercut</b> qui vous fait decoller avec la cible, clic en l'air = <b>fauchage</b> qui projette, puis chute sans controle. Les deux coutent de la stamina.</li>
      <li><b>Marteau</b> : coup a l'appui, balayage lent a 270 deg qui projette, sans bouger ; <b>clic droit maintenu</b> = charge (stamina), relacher ecrase le sol devant ; clic en l'air = frappe sautee, une par saut.</li>
      <li><b>Clic gauche en l'air</b> = plongeon : a l'epee, on se fige, on tombe a la verticale et on etourdit devant ; a la hache, on fond 4 m en avant et on etourdit tout autour</li>
      <li>Pendant un coup lourd ou un tourbillon on peut <b>bouger et sauter, ralenti</b> (Espace saute, meme avec Q ou D) — sauf apres une ruee : pas de saut</li>
      <li>La jauge sous le viseur se remplit pendant le coup : <b>doree = on peut refrapper</b>. Orange : la charge du marteau.</li>
      <li>Attaquer ralentit ; encaisser aussi. <b>Une esquive annule le ralentissement et l'etourdissement.</b></li>
      <li><b>1</b> poings &nbsp; <b>2</b> epee &nbsp; <b>3</b> longue hache &nbsp; <b>4</b> double epee &nbsp; <b>5</b> marteau (debug) &nbsp; <b>K</b> se suicider &nbsp; <b>Echap</b> liberer la souris</li>
    </ul>
  </div>
`

interface LigneFeed {
  texte: string
  classe: string
  expire: number
}

/** Degats qui montent au-dessus du mannequin de test, puis s'effacent. */
interface Chiffre {
  el: HTMLElement
  x: number
  y: number
  z: number
  debut: number
}

const DUREE_CHIFFRE = 0.9

export class Hud {
  private readonly el: Record<string, HTMLElement> = {}
  private readonly plaques = new Map<EntityId, HTMLElement>()
  private chiffres: Chiffre[] = []
  private cotePrecedent = 1

  private feed: LigneFeed[] = []
  // Mesure de vitesse : on la calcule sur les DEPLACEMENTS reels, pas sur le
  // vecteur vitesse. La separation des capsules repousse les positions sans
  // toucher a la vitesse — c'est justement ce genre de poussee qu'on veut voir.
  private mesurePos: { x: number; z: number } | null = null
  private mesureTemps = 0
  private vitesseAffichee = 0
  private pic = 0
  private picExpire = 0
  private annulation = 0
  /** « Dans le dos » : le coup fort de la double epee vient de frapper deux fois. */
  private coupDos = 0
  /** La barre de stamina clignote : un coup ou une esquive n'est pas parti, faute de stamina. */
  private manqueStamina = 0
  private vignette = 0
  private marqueur = 0
  /** Marqueur dore : un plongeon qui a touche. */
  private marqueurFort = false
  private fps = 60
  private horloge = 0

  constructor(racine: HTMLElement) {
    racine.innerHTML = GABARIT
    for (const noeud of racine.querySelectorAll<HTMLElement>('[data-vignette],[data-plaques],[data-chiffres],[data-reticule],[data-marqueur],[data-coup],[data-feed],[data-serie],[data-palier],[data-pv],[data-pv-txt],[data-stamina],[data-stamina-niveau],[data-xp],[data-niveau],[data-arme],[data-lourd],[data-ruee],[data-vitesse],[data-pic],[data-arme-lourd],[data-coup-dos],[data-etourdi],[data-sortie],[data-stats],[data-mort],[data-compte],[data-pause]')) {
      const cle = noeud.getAttributeNames().find((n) => n.startsWith('data-'))
      if (cle) this.el[cle.slice(5)] = noeud
    }
  }

  /** Consomme les evenements de la frame pour le feedback immediat. */
  consommer(monde: World, evenements: readonly Evenement[], idLocal: EntityId, camera: { encaisse(): void }): void {
    const nom = (id: EntityId | null) => (id === null ? '?' : (monde.entites.get(id)?.nom ?? '?'))

    for (const ev of evenements) {
      switch (ev.type) {
        case 'coup':
          if (ev.attaquant === idLocal) {
            this.marqueur = 1
            this.marqueurFort = false
          }
          if (ev.cible === idLocal) {
            this.vignette = 1
            camera.encaisse()
          }
          if (monde.entites.get(ev.cible)?.mesure) this.pousserChiffre(ev.degats, ev.pos.x, ev.pos.y, ev.pos.z)
          break
        case 'mort': {
          const tueur = nom(ev.tueur)
          const victime = nom(ev.victime)
          const impliqueMoi = ev.tueur === idLocal || ev.victime === idLocal
          this.pousserFeed(
            `${tueur} a elimine ${victime}  (+${ev.xp} XP)`,
            impliqueMoi ? (ev.tueur === idLocal ? 'moi' : 'contre-moi') : '',
          )
          break
        }
        case 'plongeon_impact':
          // Arrive apres les 'coup' du meme impact : c'est lui qui passe le marqueur en dore.
          if (ev.entite === idLocal && ev.touches.length > 0) this.marqueurFort = true
          break
        case 'attaque_annulee':
          if (ev.entite === idLocal) this.annulation = 1
          break
        case 'coup_dos':
          if (ev.attaquant === idLocal) this.coupDos = 1
          break
        case 'stamina_insuffisante':
          if (ev.entite === idLocal) this.manqueStamina = 1
          break
        case 'palier':
          this.pousserFeed(
            `${nom(ev.entite)} atteint le palier ${ev.rang} — ${ev.nom}`,
            ev.entite === idLocal ? 'palier-moi' : 'palier',
          )
          break
        case 'niveau':
          if (ev.entite === idLocal) this.pousserFeed(`Niveau ${ev.niveau}`, 'niveau')
          break
        default:
          break
      }
    }
  }

  maj(monde: World, moi: Entite, camera: pc.Entity, canvas: HTMLCanvasElement, dt: number): void {
    this.horloge += dt
    this.fps += ((dt > 0 ? 1 / dt : 60) - this.fps) * 0.08

    const arme = ARMES[moi.arme]

    // Jauge sous le reticule : elle se remplit pendant l'animation du coup en
    // cours et passe en dore a sa fin, quand on peut refrapper. Pendant la
    // charge du marteau, elle montre la charge, en orange.
    const jauge = this.el['coup']
    if (jauge) {
      const charge = chargeEnCours(moi, monde.temps)
      const j = charge ?? jaugeCoup(moi, monde.temps)
      jauge.style.width = `${j * 100}%`
      jauge.classList.toggle('pleine', charge === null && j >= 0.999)
      jauge.classList.toggle('charge', charge !== null)
      jauge.classList.toggle('chargee', charge !== null && charge >= 1)
    }

    this.majVitesse(monde, moi, dt)
    this.majEtourdissement(monde, moi)

    this.marqueur = Math.max(0, this.marqueur - dt * 5)
    const marqueur = this.el['marqueur']
    if (marqueur) {
      marqueur.style.opacity = String(this.marqueur)
      marqueur.classList.toggle('fort', this.marqueurFort)
    }

    this.vignette = Math.max(0, this.vignette - dt * 2.2)
    const vignette = this.el['vignette']
    if (vignette) vignette.style.opacity = String(this.vignette * 0.85)

    // Barres
    const pv = this.el['pv']
    const pvTxt = this.el['pv-txt']
    if (pv) pv.style.width = `${Math.max(0, (moi.pv / moi.pvMax) * 100)}%`
    if (pvTxt) pvTxt.textContent = `${Math.max(0, Math.ceil(moi.pv))} / ${moi.pvMax}`

    const xp = this.el['xp']
    if (xp) {
      const requis = xpPourNiveau(moi.niveau)
      xp.style.width = `${Math.min(100, (moi.xp / requis) * 100)}%`
    }

    const niveau = this.el['niveau']
    if (niveau) niveau.textContent = `Niveau ${moi.niveau}`
    const elArme = this.el['arme']
    if (elArme) elArme.textContent = arme.nom

    // Stamina : ce qui compte d'un coup d'oeil, c'est s'il reste une esquive.
    // Elle clignote quand un coup ou une esquive n'est pas parti faute d'en avoir.
    this.manqueStamina = Math.max(0, this.manqueStamina - dt * 2.5)
    const stamina = this.el['stamina']
    const niveauStamina = this.el['stamina-niveau']
    if (stamina && niveauStamina) {
      niveauStamina.style.width = `${(moi.stamina / STAMINA_MAX) * 100}%`
      stamina.classList.toggle('esquive', moi.stamina >= COUT_ESQUIVE)
      stamina.classList.toggle('manque', this.manqueStamina > 0)
    }

    // Annulation : c'est la nouvelle sanction d'un coup encaisse, et sans un
    // retour explicite le joueur croit simplement que son attaque n'a pas porte.
    this.annulation = Math.max(0, this.annulation - dt * 1.6)
    const annule = this.el['arme-lourd']
    if (annule) annule.hidden = this.annulation <= 0

    // Coup fort dans le dos : sans le dire, le second coup passe pour un hasard.
    this.coupDos = Math.max(0, this.coupDos - dt * 1.4)
    const dos = this.el['coup-dos']
    if (dos) dos.hidden = this.coupDos <= 0

    // Serie et palier
    const serie = this.el['serie']
    if (serie) serie.textContent = String(moi.serie)
    const palier = this.el['palier']
    if (palier) {
      const p = palierDe(moi.serie)
      const suivant = prochainPalier(moi.serie)
      palier.textContent = p
        ? `${p.nom} — vu a ${p.porteeAura === Infinity ? 'toute distance' : `${p.porteeAura} m`}`
        : suivant
          ? `${suivant.seuil - moi.serie} kill(s) avant « ${suivant.nom} »`
          : ''
      palier.className = `palier rang-${p?.rang ?? 0}`
    }

    // Statistiques
    const stats = this.el['stats']
    if (stats) {
      stats.innerHTML =
        `<b>${moi.kills}</b> kills &nbsp;/&nbsp; <b>${moi.morts}</b> morts<br>` +
        `meilleure serie <b>${moi.meilleureSerie}</b><br>` +
        `<span class="discret">${Math.round(this.fps)} fps</span>`
    }

    // Mort
    const mort = this.el['mort']
    if (mort) {
      mort.hidden = moi.vivant
      const compte = this.el['compte']
      if (!moi.vivant && compte) {
        const reste = Math.max(0, moi.tempsReapparition - monde.temps)
        compte.textContent = `Reapparition dans ${reste.toFixed(1)} s`
        compte.style.setProperty('--p', String(1 - reste / DELAI_REAPPARITION))
      }
    }

    this.majFeed()
    this.majPlaques(monde, moi, camera, canvas)
    this.majChiffres(camera, canvas)
  }

  afficherPause(visible: boolean): void {
    const pause = this.el['pause']
    if (pause) pause.classList.toggle('visible', visible)
  }

  // --- Interne ---------------------------------------------------------------

  /**
   * Vitesse horizontale reelle, mesuree sur la position et non sur le vecteur
   * vitesse : une poussee de separation entre capsules deplace la position sans
   * toucher a la vitesse, et n'apparaitrait pas autrement.
   * Le pic tenu 2.5 s attrape les accelerations trop breves pour etre lues.
   */
  private majVitesse(monde: World, moi: Entite, dt: number): void {
    const dtSim = monde.temps - this.mesureTemps
    if (this.mesurePos && dtSim > 1e-6) {
      const d = Math.hypot(moi.pos.x - this.mesurePos.x, moi.pos.z - this.mesurePos.z)
      // Une reapparition teleporte : ce n'est pas une vitesse.
      if (d < 8) {
        const v = d / dtSim
        this.vitesseAffichee += (v - this.vitesseAffichee) * (1 - Math.exp(-14 * dt))
        if (v > this.pic || this.horloge > this.picExpire) {
          this.pic = v
          this.picExpire = this.horloge + 2.5
        }
      }
    }
    if (!this.mesurePos) this.mesurePos = { x: 0, z: 0 }
    this.mesurePos.x = moi.pos.x
    this.mesurePos.z = moi.pos.z
    this.mesureTemps = monde.temps

    const anormal = this.vitesseAffichee > VITESSE_COURSE + 0.15
    const elVitesse = this.el['vitesse']
    if (elVitesse) {
      elVitesse.textContent = this.vitesseAffichee.toFixed(1)
      elVitesse.classList.toggle('anormale', anormal)
    }
    const elPic = this.el['pic']
    if (elPic) {
      const afficherPic = this.pic > VITESSE_COURSE + 0.15 && this.horloge <= this.picExpire
      elPic.textContent = afficherPic ? `pic ${this.pic.toFixed(1)}` : ''
      elPic.classList.toggle('anormale', afficherPic)
    }
  }

  /**
   * Etourdissement. On affiche explicitement le moment ou l'esquive redevient
   * possible : un blocage de controle n'est acceptable que si celui qui le subit
   * voit exactement combien de temps il dure et comment en sortir.
   */
  private majEtourdissement(monde: World, moi: Entite): void {
    const bloc = this.el['etourdi']
    if (!bloc) return
    const etourdi = monde.temps < moi.stunJusqua
    bloc.hidden = !etourdi
    if (!etourdi) return

    const sortie = this.el['sortie']
    if (!sortie) return
    const avantSortie = STUN_DELAI_AVANT_ESQUIVE - (monde.temps - moi.stunDepuis)
    if (avantSortie > 0) {
      sortie.textContent = `${avantSortie.toFixed(1)} s`
      sortie.classList.remove('pret')
    } else {
      sortie.textContent = moi.stamina >= COUT_ESQUIVE ? 'Q ou D + Espace pour sortir' : 'pas assez de stamina'
      sortie.classList.toggle('pret', moi.stamina >= COUT_ESQUIVE)
    }
  }

  private pousserFeed(texte: string, classe: string): void {
    this.feed.push({ texte, classe, expire: this.horloge + 6 })
    if (this.feed.length > 6) this.feed.shift()
  }

  private majFeed(): void {
    const el = this.el['feed']
    if (!el) return
    const avant = this.feed.length
    this.feed = this.feed.filter((l) => l.expire > this.horloge)
    if (this.feed.length === avant && el.childElementCount === this.feed.length) return
    el.innerHTML = this.feed.map((l) => `<div class="${l.classe}">${l.texte}</div>`).join('')
  }

  /**
   * Plaques au-dessus des tetes. Sur des capsules identiques, c'est la seule
   * facon de lire l'etat d'un adversaire — et donc de savoir s'il vaut la peine
   * d'etre attaque.
   */
  private majPlaques(monde: World, moi: Entite, camera: pc.Entity, canvas: HTMLCanvasElement): void {
    const conteneur = this.el['plaques']
    const composant = camera.camera
    if (!conteneur || !composant) return

    const echelle = canvas.clientWidth > 0 ? canvas.clientWidth / canvas.width : 1
    const posCam = camera.getPosition()
    const avant = camera.forward
    const monde3 = new pc.Vec3()
    const ecran = new pc.Vec3()

    for (const e of monde.entites.values()) {
      let plaque = this.plaques.get(e.id)
      if (!plaque) {
        plaque = document.createElement('div')
        plaque.className = 'plaque'
        plaque.innerHTML = '<span class="mesure"></span><span class="nom"></span><span class="pvb"><i></i></span>'
        conteneur.appendChild(plaque)
        this.plaques.set(e.id, plaque)
      }

      if (e.id === moi.id || !e.vivant) {
        plaque.style.display = 'none'
        continue
      }

      monde3.set(e.pos.x, e.pos.y + HAUTEUR_ENTITE + 0.45, e.pos.z)
      const dx = monde3.x - posCam.x
      const dy = monde3.y - posCam.y
      const dz = monde3.z - posCam.z
      const devant = dx * avant.x + dy * avant.y + dz * avant.z
      const distance = Math.hypot(dx, dy, dz)
      if (devant <= 0.5 || distance > 55) {
        plaque.style.display = 'none'
        continue
      }

      composant.worldToScreen(monde3, ecran)
      plaque.style.display = ''
      plaque.style.transform = `translate(-50%, -100%) translate(${ecran.x * echelle}px, ${ecran.y * echelle}px)`
      plaque.style.opacity = String(Math.max(0.25, 1 - distance / 60))

      const nom = plaque.querySelector<HTMLElement>('.nom')!
      const p = palierDe(e.serie)
      nom.textContent = p ? `${e.nom} — ${p.nom}` : e.nom
      nom.className = `nom rang-${p?.rang ?? 0}`

      const barre = plaque.querySelector<HTMLElement>('.pvb i')!
      barre.style.width = `${Math.max(0, (e.pv / e.pvMax) * 100)}%`

      // Mannequin de test : le total encaisse depuis le premier coup, et le
      // temps qu'il aurait fallu pour tuer un joueur niveau 1.
      const mesure = plaque.querySelector<HTMLElement>('.mesure')!
      const m = e.mesure
      let texte = ''
      if (m && m.coups > 0) {
        texte =
          `<b>${Math.round(m.degats)}</b> degats<br>` +
          `${m.coups} coup${m.coups > 1 ? 's' : ''} en ${(m.dernierCoupA - m.premierCoupA).toFixed(2)} s`
        if (m.koA >= 0) texte += `<br><span class="ko">${e.pvMax} PV en ${(m.koA - m.premierCoupA).toFixed(2)} s</span>`
      }
      if (mesure.innerHTML !== texte) mesure.innerHTML = texte
    }
  }

  private pousserChiffre(degats: number, x: number, y: number, z: number): void {
    const conteneur = this.el['chiffres']
    if (!conteneur) return
    const el = document.createElement('div')
    el.className = 'chiffre'
    el.textContent = String(Math.round(degats))
    conteneur.appendChild(el)
    // Partent de la poitrine, un cote puis l'autre : les deux coups d'un meme
    // geste ne se superposent pas, et aucun ne monte jusqu'a la plaque.
    this.cotePrecedent = -this.cotePrecedent
    const decalage = this.cotePrecedent * 0.35 + (Math.random() - 0.5) * 0.15
    this.chiffres.push({ el, x: x + decalage, y: y + HAUTEUR_ENTITE * 0.65, z, debut: this.horloge })
  }

  /** Les chiffres montent sous la plaque et s'effacent. */
  private majChiffres(camera: pc.Entity, canvas: HTMLCanvasElement): void {
    const composant = camera.camera
    if (!composant) return
    const echelle = canvas.clientWidth > 0 ? canvas.clientWidth / canvas.width : 1
    const posCam = camera.getPosition()
    const avant = camera.forward
    const monde3 = new pc.Vec3()
    const ecran = new pc.Vec3()

    this.chiffres = this.chiffres.filter((c) => {
      const age = (this.horloge - c.debut) / DUREE_CHIFFRE
      if (age >= 1) {
        c.el.remove()
        return false
      }
      monde3.set(c.x, c.y + age * 0.75, c.z)
      const devant =
        (monde3.x - posCam.x) * avant.x + (monde3.y - posCam.y) * avant.y + (monde3.z - posCam.z) * avant.z
      c.el.style.display = devant > 0.5 ? '' : 'none'
      composant.worldToScreen(monde3, ecran)
      c.el.style.transform =
        `translate(-50%, -50%) translate(${ecran.x * echelle}px, ${ecran.y * echelle}px) scale(${1.3 - 0.3 * age})`
      c.el.style.opacity = String(1 - age * age)
      return true
    })
  }
}
