import type { Carte } from './carte'
import { ARMES, cibleDevant, ciblesAutour } from './combat'
import {
  ACCEL_AIR,
  ACCEL_SOL,
  COMBO_FENETRE,
  COUT_ESQUIVE,
  DELAI_REAPPARITION,
  DUREE_ESQUIVE,
  DUREE_RALENTI_TOUCHE,
  FRICTION_AIR,
  FRICTION_SOL,
  GRAVITE,
  INVULN_APRES_COUP,
  LEGERE_ELAN,
  LEGERE_POUSSEE,
  LOURD_DEGATS,
  LOURD_DEMI_ANGLE,
  LOURD_ELAN,
  LOURD_POUSSEE,
  LOURD_SWING,
  MANNEQUIN_PV,
  MAX_TICKS_PAR_FRAME,
  MULT_RALENTI,
  NIVEAU_MAX,
  PLONGEON_DEGATS,
  PLONGEON_DEMI_ANGLE,
  PLONGEON_PORTEE,
  PLONGEON_STUN,
  PLONGEON_SUSPENSION,
  PLONGEON_VITESSE_CHUTE,
  PROTECTION_APPARITION,
  RAYON_ENTITE,
  RECUPERATION_PLONGEON,
  REGEN_DELAI_APRES_DEGATS,
  REGEN_ESQUIVE,
  REGEN_PV_PAR_SECONDE,
  RUEE_DEGATS,
  RUEE_DISTANCE,
  RUEE_INVULN,
  RUEE_RAYON_IMPACT,
  RUEE_STUN,
  RUEE_VITESSE,
  SEUIL_CLIC_MAINTIEN,
  STUN_APRES_ATTERRISSAGE,
  STUN_DELAI_AVANT_ESQUIVE,
  TICK_DT,
  TOUR_DEGATS,
  TOUR_DUREE,
  TOUR_IMPACT,
  TOUR_MAX,
  TOUR_RAYON,
  TOUR_RECUPERATION,
  VITESSE_COURSE,
  VITESSE_ESQUIVE,
  VITESSE_SAUT,
  WINDUP_LOURD,
  WINDUP_NORMAL,
} from './constants'
import { majIA } from './ia'
import { avant, copieV3, distanceXZ, droite, longueurXZ, v3, type Vec3 } from './math'
import { palierDe, pvMaxPourNiveau, xpDuKill, xpPourNiveau } from './progression'
import { entreeVide, type Entite, type EntityId, type Espece, type Evenement } from './types'

/**
 * La simulation. Autoritaire, deterministe a pas fixe, sans aucune dependance moteur.
 *
 * Elle tourne aujourd'hui uniquement dans le client (§7 semaine 1 : local, capsules,
 * aucun reseau). Le jour ou le serveur arrive, c'est CE fichier qui tourne cote
 * serveur, et le client se contente de rejouer ses propres entrees par-dessus.
 * Rien ici ne doit jamais importer PlayCanvas.
 */
export class World {
  readonly carte: Carte
  readonly entites = new Map<EntityId, Entite>()
  /** Vide par le consommateur a chaque frame. Sert au feedback : VFX, sons, kill feed. */
  readonly evenements: Evenement[] = []

  temps = 0
  private prochainId = 1
  private accumulateur = 0
  private indexApparition = 0

  constructor(carte: Carte) {
    this.carte = carte
    this.indexApparition = Math.floor(Math.random() * Math.max(1, carte.apparitions.length))
  }

  // --- Cycle de vie ---------------------------------------------------------

  creerJoueur(nom: string): Entite {
    return this.creer('joueur', nom)
  }

  creerMannequin(nom: string): Entite {
    const e = this.creer('mannequin', nom)
    e.pvMax = MANNEQUIN_PV
    e.pv = MANNEQUIN_PV
    e.ia = {
      cible: 0,
      prochaineDecision: 0,
      prochaineAttaque: 0,
      biaisStrafe: Math.random() < 0.5 ? -1 : 1,
    }
    return e
  }

  private creer(espece: Espece, nom: string): Entite {
    const pos = this.pointApparition()
    const e: Entite = {
      id: this.prochainId++,
      espece,
      nom,
      pos,
      vel: v3(),
      yaw: Math.atan2(pos.x, pos.z), // regarde vers le centre
      pitch: 0,
      auSol: true,
      finEsquive: -99,
      jaugeEsquive: 1,
      directionEsquive: 1,
      ralentiJusqua: -99,
      stunJusqua: -99,
      stunDepuis: -99,
      plongeon: 'aucun',
      finSuspension: -99,
      dernierPlongeonA: -99,
      finRecuperation: -99,
      sautInterditJusqua: -99,
      maintienDepuis: -99,
      lourdPendantCeMaintien: false,
      dernierLourdA: -99,
      attaqueEnCours: 'aucun',
      attaqueImpactA: -99,
      attaqueAnnuleeA: -99,
      comboEtape: -1,
      coupEnAttente: false,
      tourbillon: 0,
      tourDemande: false,
      dernierTourA: -99,
      ruee: 'aucun',
      rueeOrigine: v3(),
      rueeDirection: v3(0, 0, -1),
      finPoussee: -99,
      vivant: true,
      pv: pvMaxPourNiveau(1),
      pvMax: pvMaxPourNiveau(1),
      niveau: 1,
      xp: 0,
      serie: 0,
      meilleureSerie: 0,
      kills: 0,
      morts: 0,
      // §2 : on commence nu, on frappe aux poings.
      arme: 'poings',
      dernierCoupA: -99,
      finSwing: -99,
      invulnJusqua: this.temps + PROTECTION_APPARITION,
      dernierDegatSubiA: -99,
      tempsReapparition: 0,
      contributeurs: new Map(),
      entree: entreeVide(),
    }
    this.entites.set(e.id, e)
    this.evenements.push({ type: 'apparition', entite: e.id })
    return e
  }

  entree(id: EntityId) {
    const e = this.entites.get(id)
    if (!e) throw new Error(`Entite inconnue : ${id}`)
    return e.entree
  }

  /** Mort sans tueur. Sert au debug local ; servira aussi aux chutes et zones. */
  forcerMort(id: EntityId): void {
    const e = this.entites.get(id)
    if (e?.vivant) this.tuer(e, null)
  }

  // --- Boucle ---------------------------------------------------------------

  /** Avance la simulation d'un temps reel arbitraire, par pas fixes. */
  avancer(dtReel: number): void {
    this.accumulateur += Math.min(dtReel, 0.25)
    let n = 0
    while (this.accumulateur >= TICK_DT && n < MAX_TICKS_PAR_FRAME) {
      this.accumulateur -= TICK_DT
      this.tick(TICK_DT)
      n++
    }
    if (n >= MAX_TICKS_PAR_FRAME) this.accumulateur = 0
  }

  private tick(dt: number): void {
    this.temps += dt

    for (const e of this.entites.values()) {
      if (!e.vivant) {
        if (this.temps >= e.tempsReapparition) this.reapparaitre(e)
        continue
      }
      if (e.ia) majIA(this.temps, e, this.entites.values())
      this.deplacer(e, dt)
      this.regenerer(e, dt)
    }

    for (const e of this.entites.values()) {
      if (!e.vivant) continue
      const libre = this.temps >= e.stunJusqua

      if (e.entree.speciale) {
        e.entree.speciale = false
        if (libre) this.tenterSpeciale(e)
      }

      // Clic ou maintien ? On ne decide rien a l'appui : c'est la duree du
      // maintien qui tranche, donc un coup lourd n'est jamais precede d'un
      // coup normal. Un maintien ne donne qu'un coup lourd : pour en relancer
      // un, il faut relacher.
      if (e.entree.attaqueMaintenue) {
        if (e.maintienDepuis < 0) {
          e.maintienDepuis = this.temps
          e.lourdPendantCeMaintien = false
        }
        const pret = e.attaqueEnCours === 'aucun' && this.temps >= e.finRecuperation
        if (pret && !e.lourdPendantCeMaintien && this.temps - e.maintienDepuis >= SEUIL_CLIC_MAINTIEN) {
          this.lancerAttaque(e, 'lourd')
        }
      } else {
        const clicBref =
          e.maintienDepuis >= 0 &&
          !e.lourdPendantCeMaintien &&
          this.temps - e.maintienDepuis < SEUIL_CLIC_MAINTIEN
        e.maintienDepuis = -99
        e.lourdPendantCeMaintien = false
        // Pendant un coup de l'enchainement, le clic est garde pour le suivant.
        if (clicBref && !this.lancerAttaque(e, 'normal') && this.peutEnchainer(e)) e.coupEnAttente = true
      }

      // Le coup demande pendant le precedent part des que celui-ci se termine.
      if (e.coupEnAttente && this.temps >= e.finSwing) {
        e.coupEnAttente = false
        this.lancerAttaque(e, 'normal')
      }

      if (e.tourbillon > 0 && this.temps >= e.dernierTourA + TOUR_DUREE) this.finirTour(e)

      // Resolution d'une attaque lancee : c'est ici que les degats tombent,
      // un cran apres l'entree. Si on a ete touche entre-temps, elle a ete
      // annulee et n'arrive jamais jusqu'ici.
      if (e.attaqueEnCours !== 'aucun' && this.temps >= e.attaqueImpactA) {
        const type = e.attaqueEnCours
        e.attaqueEnCours = 'aucun'
        if (type === 'lourd') this.resoudreLourd(e)
        else if (type === 'tour') this.resoudreTour(e)
        else this.resoudreNormal(e)
      }
    }

    this.separer()
  }

  // --- Deplacement ----------------------------------------------------------

  private deplacer(e: Entite, dt: number): void {
    const entree = e.entree
    // Vue a la 3e personne facon Marvel Rivals : le corps suit toujours la
    // camera, on strafe et on recule sans jamais tourner le dos au reticule.
    e.yaw = entree.yaw
    e.pitch = entree.pitch

    e.jaugeEsquive = Math.min(1, e.jaugeEsquive + REGEN_ESQUIVE * dt)

    // L'esquive est traitee en premier : c'est elle qui peut annuler
    // l'etourdissement et le ralentissement de ce tick.
    if (entree.esquive !== 0) {
      // Pendant son propre coup lourd ou son tourbillon, l'esquive est
      // interdite : elle laverait le ralentissement, qui fait partie de leur
      // cout. Espace + un cote y devient donc un saut — sinon on ne peut pas
      // sauter en strafant.
      if (this.esquiveInterdite(e)) entree.saut = true
      else this.tenterEsquive(e, entree.esquive)
      entree.esquive = 0
    }

    // Etourdi ou en recuperation de plongeon : plus aucun controle. Le coup
    // lourd, lui, laisse bouger et sauter — ralenti.
    const bloque = this.temps < e.stunJusqua || this.temps < e.finRecuperation
    const f = avant(e.yaw)
    const d = droite(e.yaw)
    let ix = 0
    let iz = 0
    let intensite = 0
    if (!bloque) {
      ix = d.x * entree.moveX + f.x * entree.moveZ
      iz = d.z * entree.moveX + f.z * entree.moveZ
      intensite = Math.hypot(ix, iz)
      if (intensite > 1) {
        ix /= intensite
        iz /= intensite
      }
    }

    if (e.ruee === 'course') {
      // Direction figee au depart : la ruee ne se pilote pas.
      e.vel.x = e.rueeDirection.x * RUEE_VITESSE
      e.vel.z = e.rueeDirection.z * RUEE_VITESSE
      e.vel.y = 0
    } else if (e.plongeon === 'suspension') {
      // Fige en l'air, le temps que l'adversaire voie ce qui arrive.
      e.vel.x = 0
      e.vel.y = 0
      e.vel.z = 0
      if (this.temps >= e.finSuspension) e.plongeon = 'chute'
    } else if (e.plongeon === 'chute') {
      // Chute verticale imposee, sur sa propre position : le plongeon ne sert
      // pas a se deplacer, il sert a tomber la ou on a decide de tomber.
      e.vel.x = 0
      e.vel.z = 0
      e.vel.y = PLONGEON_VITESSE_CHUTE
    } else if (this.temps < e.finEsquive) {
      // Pendant la fenetre d'esquive : ni friction ni acceleration. La vitesse
      // reste constante, la trajectoire est lisible pour l'adversaire, et le
      // joueur ne peut pas rallonger son dash en poussant le stick.
    } else {
      // Modele Quake : friction d'abord...
      const friction = e.auSol ? FRICTION_SOL : FRICTION_AIR
      const amorti = Math.exp(-friction * dt)
      e.vel.x *= amorti
      e.vel.z *= amorti

      // ...puis acceleration bornee, projetee sur l'intention.
      // Un ralentissement abaisse la vitesse VISEE, pas la vitesse actuelle :
      // c'est la friction qui fait redescendre, en 0.13 s. Un plafond dur
      // arracherait la vitesse d'un coup et se sentirait comme un accroc.
      if (intensite > 0.01) {
        const vmax = this.temps < e.ralentiJusqua ? VITESSE_COURSE * MULT_RALENTI : VITESSE_COURSE
        const accel = e.auSol ? ACCEL_SOL : ACCEL_AIR
        const courant = e.vel.x * ix + e.vel.z * iz
        const ajout = Math.min(accel * dt, Math.max(0, vmax - courant))
        e.vel.x += ix * ajout
        e.vel.z += iz * ajout
      }

      // Plafond dur sur la vitesse reelle.
      //
      // L'acceleration ci-dessus ne borne que la PROJECTION de la vitesse sur
      // l'intention, pas sa norme : c'est la formule de Quake, et c'est
      // exactement ce qui y rend le strafe-jump possible. Des qu'une contrainte
      // retire une composante de la vitesse a chaque tick — le mur de l'arene,
      // qui annule la composante radiale — la composante restante s'accumule.
      // Longer le bord montait ainsi a 10.2 m/s au lieu de 8.13, et l'arene
      // etant circulaire il suffisait de suivre le mur pour en profiter.
      //
      // On veut une vitesse unique pour tout le monde, partout : on plafonne.
      // Ce plafond termine aussi l'esquive, dont la vitesse retombe ici.
      // Seule exception : la fenetre de poussee d'un coup lourd, sinon le
      // recul serait rabote des le premier tick et ne se verrait jamais.
      const vitesse = longueurXZ(e.vel)
      if (vitesse > VITESSE_COURSE && this.temps >= e.finPoussee) {
        const k = VITESSE_COURSE / vitesse
        e.vel.x *= k
        e.vel.z *= k
      }
    }

    if (entree.saut) {
      entree.saut = false
      if (
        !bloque &&
        e.auSol &&
        e.plongeon === 'aucun' &&
        e.ruee === 'aucun' &&
        this.temps >= e.finEsquive &&
        this.temps >= e.sautInterditJusqua
      ) {
        e.vel.y = VITESSE_SAUT
        e.auSol = false
      }
    }

    // Le plongeon et la ruee pilotent eux-memes leur verticale.
    if (e.plongeon === 'aucun' && e.ruee === 'aucun') e.vel.y += GRAVITE * dt

    e.pos.x += e.vel.x * dt
    e.pos.y += e.vel.y * dt
    e.pos.z += e.vel.z * dt

    if (e.pos.y <= this.carte.hauteurSol) {
      e.pos.y = this.carte.hauteurSol
      if (e.vel.y < 0) e.vel.y = 0
      e.auSol = true
      if (e.plongeon === 'chute') this.impactPlongeon(e)
    } else {
      e.auSol = false
    }

    this.contenirDansArene(e)

    if (e.ruee === 'course') this.majRuee(e)
  }

  /**
   * Esquive laterale, au sol comme en l'air. Ce qui la limite n'est pas le
   * contact avec le sol mais la jauge : deux d'affilee, puis il faut attendre.
   */
  private tenterEsquive(e: Entite, direction: number): void {
    // On ne s'extrait ni de son propre plongeon, ni de sa recuperation : c'est
    // ce qui fait que le plongeon a un cout, et pas seulement un effet.
    if (e.plongeon !== 'aucun' || e.ruee !== 'aucun' || this.temps < e.finRecuperation) return
    // Une esquive a la fois : deux dashes simultanes ne se lisent pas.
    if (this.temps < e.finEsquive) return
    if (e.jaugeEsquive < COUT_ESQUIVE) return
    // Sortie d'etourdissement : possible, mais jamais tout de suite. Le
    // plongeon doit garantir un temps de controle, sinon il ne vaut rien.
    if (this.temps < e.stunJusqua && this.temps - e.stunDepuis < STUN_DELAI_AVANT_ESQUIVE) return

    const signe = direction < 0 ? -1 : 1
    const d = droite(e.yaw)
    e.vel.x = d.x * VITESSE_ESQUIVE * signe
    e.vel.z = d.z * VITESSE_ESQUIVE * signe
    e.finEsquive = this.temps + DUREE_ESQUIVE
    e.jaugeEsquive -= COUT_ESQUIVE
    e.directionEsquive = signe

    // L'esquive lave tout : c'est la reponse a l'engagement, pas seulement a la portee.
    e.ralentiJusqua = -99
    e.stunJusqua = -99
    // Y compris une projection : sans ca, le plafond de vitesse resterait leve
    // et l'esquive aerienne deviendrait un vol plane de dix metres.
    e.finPoussee = -99

    this.evenements.push({ type: 'esquive', entite: e.id, direction: signe })
  }

  /** Clic droit : l'action speciale de l'arme. Aux poings, rien. */
  private tenterSpeciale(e: Entite): void {
    const speciale = ARMES[e.arme].speciale
    if (speciale === 'ruee') this.tenterRuee(e)
    else if (speciale === 'tourbillon') this.demanderTour(e)
  }

  // --- Ruee -----------------------------------------------------------------

  private tenterRuee(e: Entite): void {
    if (this.temps < e.finRecuperation) return
    // Pas pendant un coup lourd : la ruee annulerait celui qu'elle vient
    // d'enchainer, et ruee sur ruee on filerait a 18 m/s.
    if (this.enCoupLourd(e)) return
    if (e.ruee !== 'aucun' || e.plongeon !== 'aucun') return
    if (this.temps < e.finEsquive) return
    if (!e.auSol) return

    const f = avant(e.yaw)
    e.ruee = 'course'
    e.rueeOrigine = copieV3(e.pos)
    e.rueeDirection = { x: f.x, y: 0, z: f.z }
    e.attaqueEnCours = 'aucun'
    e.maintienDepuis = -99
    this.evenements.push({ type: 'ruee', entite: e.id })
  }

  /** Arret sur le premier ennemi touche, sur le mur, ou a bout de distance. */
  private majRuee(e: Entite): void {
    for (const c of this.entites.values()) {
      if (c === e || !c.vivant) continue
      if (distanceXZ(e.pos, c.pos) <= RUEE_RAYON_IMPACT) {
        this.finirRuee(e, c)
        return
      }
    }

    if (distanceXZ(e.pos, e.rueeOrigine) >= RUEE_DISTANCE) {
      this.finirRuee(e, null)
      return
    }

    // Le mur arrete la ruee aussi surement qu'un ennemi.
    if (longueurXZ(e.pos) >= this.carte.rayon - RAYON_ENTITE - 0.01) {
      this.finirRuee(e, null)
    }
  }

  private finirRuee(e: Entite, cible: Entite | null): void {
    e.ruee = 'aucun'
    e.vel.x = 0
    e.vel.z = 0

    if (cible && this.temps >= cible.invulnJusqua) {
      this.infligerDegats(cible, e, RUEE_DEGATS)
      if (cible.vivant) {
        cible.stunJusqua = this.temps + RUEE_STUN
        cible.stunDepuis = this.temps
        cible.invulnJusqua = this.temps + RUEE_INVULN
      }
    }

    // Le coup lourd part toujours, cible touchee ou non, meme si un coup normal
    // etait encore en cours. C'est lui qui empeche de ruer pour se deplacer
    // plus vite qu'en courant : une seconde ralenti, sans ruee, et pour
    // celui-la seulement, sans saut.
    e.finSwing = -99
    this.lancerAttaque(e, 'lourd')
    e.sautInterditJusqua = e.finSwing

    this.evenements.push({
      type: 'ruee_impact',
      entite: e.id,
      cible: cible?.id ?? null,
      pos: copieV3(e.pos),
    })
  }

  // --- Tourbillon ------------------------------------------------------------

  /**
   * Un clic = un tour. Pendant un tour, le clic demande le suivant ; sinon il
   * lance le tourbillon, si aucun autre coup ne le bloque.
   */
  private demanderTour(e: Entite): void {
    if (e.tourbillon > 0) {
      if (e.tourbillon < TOUR_MAX) e.tourDemande = true
      return
    }
    this.lancerAttaque(e, 'tour')
  }

  /** Fin d'un tour : le suivant part s'il a ete demande ou si le clic droit est maintenu. */
  private finirTour(e: Entite): void {
    const suite =
      e.tourbillon < TOUR_MAX &&
      (e.tourDemande || e.entree.specialeMaintenue) &&
      ARMES[e.arme].speciale === 'tourbillon' &&
      this.temps >= e.stunJusqua
    if (suite) {
      this.demarrerAttaque(e, 'tour')
    } else {
      e.tourbillon = 0
      e.tourDemande = false
    }
  }

  /** Un tour frappe tout ce qui l'entoure, une fois chacun. Le dernier repousse un peu. */
  private resoudreTour(e: Entite): void {
    const dernier = e.tourbillon === TOUR_MAX
    for (const c of ciblesAutour(e, this.temps, this.entites.values(), TOUR_RAYON)) {
      this.infligerDegats(c, e, TOUR_DEGATS)
      if (dernier && c.vivant) this.projeter(c, e, LEGERE_POUSSEE, LEGERE_ELAN)
    }
  }

  // --- Coup lourd -----------------------------------------------------------

  private resoudreLourd(e: Entite): void {
    const portee = ARMES[e.arme].porteeLourd
    const cible = cibleDevant(e, this.temps, this.entites.values(), portee, LOURD_DEMI_ANGLE)
    if (cible) {
      this.infligerDegats(cible, e, LOURD_DEGATS)
      if (cible.vivant) this.projeter(cible, e, LOURD_POUSSEE, LOURD_ELAN)
    }

    this.evenements.push({ type: 'coup_lourd', attaquant: e.id, cible: cible?.id ?? null })
  }

  /**
   * La cible decolle et part en arriere, dans l'axe de `source`. Elle reste
   * etourdie pendant tout son vol, plus un court temps au sol.
   */
  private projeter(cible: Entite, source: Entite, poussee: number, elan: number): void {
    let dx = cible.pos.x - source.pos.x
    let dz = cible.pos.z - source.pos.z
    const len = Math.hypot(dx, dz)
    if (len < 1e-4) {
      const f = avant(source.yaw)
      dx = f.x
      dz = f.z
    } else {
      dx /= len
      dz /= len
    }
    // Vitesse IMPOSEE, pas ajoutee : une cible qui fonce sur l'attaquant
    // doit partir aussi loin qu'une cible immobile.
    cible.vel.x = dx * poussee
    cible.vel.z = dz * poussee
    cible.vel.y = elan
    // Sinon le premier tick applique encore la friction du sol.
    cible.auSol = false
    cible.stunJusqua = this.temps + (2 * elan) / -GRAVITE + STUN_APRES_ATTERRISSAGE
    cible.stunDepuis = this.temps
    cible.finPoussee = cible.stunJusqua
  }

  private contenirDansArene(e: Entite): void {
    const limite = this.carte.rayon - RAYON_ENTITE
    const r = longueurXZ(e.pos)
    if (r <= limite) return
    const nx = e.pos.x / r
    const nz = e.pos.z / r
    e.pos.x = nx * limite
    e.pos.z = nz * limite
    const radial = e.vel.x * nx + e.vel.z * nz
    if (radial > 0) {
      e.vel.x -= nx * radial
      e.vel.z -= nz * radial
    }
  }

  /** Repousse les capsules qui s'interpenetrent. Suffisant a 8-16 entites. */
  private separer(): void {
    const liste = [...this.entites.values()].filter((e) => e.vivant)
    const min = RAYON_ENTITE * 2
    for (let i = 0; i < liste.length; i++) {
      for (let j = i + 1; j < liste.length; j++) {
        const a = liste[i]!
        const b = liste[j]!
        let dx = b.pos.x - a.pos.x
        let dz = b.pos.z - a.pos.z
        let dist = Math.hypot(dx, dz)
        if (dist >= min) continue
        if (dist < 1e-4) {
          dx = Math.random() - 0.5
          dz = Math.random() - 0.5
          dist = Math.hypot(dx, dz) || 1
        }
        const poussee = (min - dist) / 2
        const nx = dx / dist
        const nz = dz / dist
        a.pos.x -= nx * poussee
        a.pos.z -= nz * poussee
        b.pos.x += nx * poussee
        b.pos.z += nz * poussee
      }
    }
    for (const e of liste) this.contenirDansArene(e)
  }

  private regenerer(e: Entite, dt: number): void {
    if (e.pv >= e.pvMax) return
    if (this.temps - e.dernierDegatSubiA < REGEN_DELAI_APRES_DEGATS) return
    e.pv = Math.min(e.pvMax, e.pv + REGEN_PV_PAR_SECONDE * dt)
  }

  // --- Combat ---------------------------------------------------------------

  /**
   * Met une attaque « en vol », si rien ne l'empeche. Les degats ne tombent
   * qu'a l'impact, un cran plus tard : entre les deux, encaisser un coup
   * l'annule. Renvoie faux si l'attaque n'est pas partie.
   */
  private lancerAttaque(e: Entite, type: 'normal' | 'lourd' | 'tour'): boolean {
    // Etourdi : ni deplacement ni attaque. Sans ce garde, une cible projetee
    // a l'epee sortait de sa projection par un plongeon.
    if (this.temps < e.stunJusqua) return false
    if (this.temps < e.finRecuperation) return false
    if (e.ruee !== 'aucun' || e.plongeon !== 'aucun') return false
    if (this.temps < e.finEsquive) return false
    // Aucun nouveau coup avant la fin de l'animation du precedent : c'est ce
    // que montre la jauge sous le reticule.
    if (this.temps < e.finSwing) return false

    // En l'air, l'epee et la hache ne frappent pas : elles plongent.
    if (type !== 'tour' && ARMES[e.arme].plonge && !e.auSol) {
      this.lancerPlongeon(e)
      return true
    }

    this.demarrerAttaque(e, type)
    return true
  }

  /** Lance l'attaque sans verifier les verrous : c'est a l'appelant de le faire. */
  private demarrerAttaque(e: Entite, type: 'normal' | 'lourd' | 'tour'): void {
    const arme = ARMES[e.arme]
    const finPrecedent = e.finSwing
    e.attaqueEnCours = type
    e.dernierCoupA = this.temps
    e.coupEnAttente = false

    if (type === 'lourd') {
      e.attaqueImpactA = this.temps + WINDUP_LOURD
      e.dernierLourdA = this.temps
      // Consomme le maintien en cours, y compris quand c'est la ruee qui lance
      // le coup : garder le bouton enfonce n'en relancera pas un second.
      e.lourdPendantCeMaintien = true
      e.finSwing = this.temps + LOURD_SWING
      e.comboEtape = -1
    } else if (type === 'tour') {
      // 0 -> 1 au lancement, puis 2 et 3 quand les tours s'enchainent.
      e.tourbillon++
      e.tourDemande = false
      e.dernierTourA = this.temps
      e.attaqueImpactA = this.temps + TOUR_IMPACT
      // Suppose que c'est le dernier : le tour suivant, s'il vient, repousse
      // cette fin et saute la recuperation.
      e.finSwing = this.temps + TOUR_DUREE + TOUR_RECUPERATION
      e.comboEtape = -1
    } else {
      // Enchainement : le coup suit le precedent de pres, et il en reste un.
      const enchaine =
        e.comboEtape >= 0 &&
        e.comboEtape < arme.degats.length - 1 &&
        this.temps <= finPrecedent + COMBO_FENETRE
      e.comboEtape = enchaine ? e.comboEtape + 1 : 0
      e.attaqueImpactA = this.temps + WINDUP_NORMAL
      e.finSwing = this.temps + arme.dureeSwing
    }
    // Attaquer engage : ralenti exactement le temps du swing. Le coup lourd
    // et le tourbillon laissent bouger et sauter, mais a cette allure.
    e.ralentiJusqua = e.finSwing

    this.evenements.push({ type: 'attaque_lancee', entite: e.id, attaque: type })
  }

  /** Le coup lourd lance en dernier n'est pas termine, qu'il ait ete annule ou non. */
  private enCoupLourd(e: Entite): boolean {
    return this.temps - e.dernierLourdA < LOURD_SWING
  }

  /** Un tour est en cours, ou le retour en garde qui suit le dernier. */
  private enTourbillon(e: Entite): boolean {
    return e.tourbillon > 0 || (this.temps < e.finSwing && e.dernierCoupA === e.dernierTourA)
  }

  private esquiveInterdite(e: Entite): boolean {
    return this.enCoupLourd(e) || this.enTourbillon(e)
  }

  /** Un clic pendant un coup de l'enchainement demande le suivant. */
  private peutEnchainer(e: Entite): boolean {
    return e.comboEtape >= 0 && e.comboEtape < ARMES[e.arme].degats.length - 1 && this.temps < e.finSwing
  }

  private resoudreNormal(e: Entite): void {
    const cible = cibleDevant(e, this.temps, this.entites.values())
    if (!cible) {
      this.evenements.push({ type: 'coup_vide', attaquant: e.id })
      return
    }
    const degats = ARMES[e.arme].degats
    const etape = Math.min(Math.max(0, e.comboEtape), degats.length - 1)
    this.infligerDegats(cible, e, degats[etape]!)
    // Le dernier coup d'un enchainement projette un peu.
    if (degats.length > 1 && etape === degats.length - 1 && cible.vivant) {
      this.projeter(cible, e, LEGERE_POUSSEE, LEGERE_ELAN)
    }
  }

  private infligerDegats(cible: Entite, attaquant: Entite, degats: number): void {
    cible.pv -= degats
    cible.invulnJusqua = this.temps + INVULN_APRES_COUP
    cible.dernierDegatSubiA = this.temps
    // Encaisser ralentit aussi : un echange laisse les deux camps englues,
    // et c'est l'esquive qui en sort — pas la vitesse brute.
    cible.ralentiJusqua = Math.max(cible.ralentiJusqua, this.temps + DUREE_RALENTI_TOUCHE)

    // Encaisser ANNULE l'attaque en cours (S4 League). C'est ce qui remplace le
    // recul sur un coup normal : interrompre vaut mieux que deplacer, et ca ne
    // casse ni les distances ni la lisibilite du combat.
    if (cible.attaqueEnCours !== 'aucun') {
      cible.attaqueEnCours = 'aucun'
      cible.attaqueAnnuleeA = this.temps
      cible.maintienDepuis = -99
      this.evenements.push({ type: 'attaque_annulee', entite: cible.id })
    }
    // Et casse ce qu'elle enchainait : le coup suivant du combo, les tours
    // suivants du tourbillon.
    cible.comboEtape = -1
    cible.coupEnAttente = false
    cible.tourbillon = 0
    cible.tourDemande = false
    // §2 : la prime se partage entre tous ceux qui ont touche dans les 10 s.
    // Pas de prime sur une map vide, mais la trace est deja la.
    cible.contributeurs.set(attaquant.id, this.temps)

    // Aucun recul : encaisser ne deplace pas la cible. Le coup se lit au flash
    // et a l'ecrasement cote client, pas a un rebond.

    this.evenements.push({
      type: 'coup',
      attaquant: attaquant.id,
      cible: cible.id,
      degats,
      pos: copieV3(cible.pos),
    })

    if (cible.pv <= 0) this.tuer(cible, attaquant)
  }

  /**
   * Attaque sautee a l'epee ou a la hache. Deux temps : une suspension pendant
   * laquelle le personnage se fige en l'air — c'est la seule vraie fenetre de
   * telegraphe du jeu, et elle ne coute rien au ping puisque c'est l'attaquant
   * qui s'immobilise — puis une chute verticale rapide sur sa propre position.
   */
  private lancerPlongeon(e: Entite): void {
    e.plongeon = 'suspension'
    e.finSuspension = this.temps + PLONGEON_SUSPENSION
    e.comboEtape = -1
    e.coupEnAttente = false
    this.evenements.push({ type: 'plongeon', entite: e.id })
  }

  private impactPlongeon(e: Entite): void {
    e.plongeon = 'aucun'
    e.dernierPlongeonA = this.temps
    e.finRecuperation = this.temps + RECUPERATION_PLONGEON
    // L'animation du plongeon se termine avec sa recuperation : la jauge se
    // remplit pendant ce temps-la.
    e.dernierCoupA = this.temps
    e.finSwing = e.finRecuperation
    e.vel.x = 0
    e.vel.z = 0

    const f = avant(e.yaw)
    const touches: EntityId[] = []

    // Zone d'effet : tout ce qui est devant, pas une cible unique. C'est ce qui
    // fait du plongeon une reponse a un groupe — donc a une coalition.
    for (const c of this.entites.values()) {
      if (c === e || !c.vivant) continue
      if (this.temps < c.invulnJusqua) continue
      if (distanceXZ(e.pos, c.pos) > PLONGEON_PORTEE) continue

      const vx = c.pos.x - e.pos.x
      const vz = c.pos.z - e.pos.z
      const len = Math.hypot(vx, vz) || 1
      const cos = (f.x * vx + f.z * vz) / len
      if (Math.acos(Math.max(-1, Math.min(1, cos))) > PLONGEON_DEMI_ANGLE) continue

      this.infligerDegats(c, e, PLONGEON_DEGATS)
      if (c.vivant) {
        c.stunJusqua = this.temps + PLONGEON_STUN
        c.stunDepuis = this.temps
        touches.push(c.id)
      }
    }

    this.evenements.push({
      type: 'plongeon_impact',
      entite: e.id,
      pos: copieV3(e.pos),
      touches,
    })
  }

  private tuer(victime: Entite, tueur: Entite | null): void {
    const xp = xpDuKill(victime)

    victime.vivant = false
    victime.pv = 0
    victime.morts++
    victime.tempsReapparition = this.temps + DELAI_REAPPARITION

    if (tueur && tueur !== victime && tueur.vivant) {
      const rangAvant = palierDe(tueur.serie)?.rang ?? 0
      tueur.kills++
      tueur.serie++
      tueur.meilleureSerie = Math.max(tueur.meilleureSerie, tueur.serie)
      this.donnerXp(tueur, xp)
      const apres = palierDe(tueur.serie)
      if (apres && apres.rang > rangAvant) {
        this.evenements.push({ type: 'palier', entite: tueur.id, rang: apres.rang, nom: apres.nom })
      }
    }

    this.evenements.push({
      type: 'mort',
      victime: victime.id,
      tueur: tueur?.id ?? null,
      xp,
      pos: copieV3(victime.pos),
    })

    // §2 — "A la mort : retour niveau 1, sans equipement." Remise a zero seche.
    victime.niveau = 1
    victime.xp = 0
    victime.serie = 0
    victime.arme = 'poings'
    victime.contributeurs.clear()
  }

  private donnerXp(e: Entite, xp: number): void {
    e.xp += xp
    while (e.niveau < NIVEAU_MAX && e.xp >= xpPourNiveau(e.niveau)) {
      e.xp -= xpPourNiveau(e.niveau)
      e.niveau++
      const ancien = e.pvMax
      e.pvMax = pvMaxPourNiveau(e.niveau)
      // Le gain de PV max ne soigne pas : monter de niveau ne sauve personne.
      e.pv = Math.min(e.pvMax, e.pv + (e.pvMax - ancien))
      this.evenements.push({ type: 'niveau', entite: e.id, niveau: e.niveau })
    }
    if (e.niveau >= NIVEAU_MAX) e.xp = 0
  }

  private reapparaitre(e: Entite): void {
    e.vivant = true
    e.niveau = 1
    e.xp = 0
    e.serie = 0
    e.arme = 'poings'
    e.pvMax = e.espece === 'mannequin' ? MANNEQUIN_PV : pvMaxPourNiveau(1)
    e.pv = e.pvMax
    e.pos = this.pointApparition()
    e.vel = v3()
    e.auSol = true
    e.finEsquive = -99
    e.jaugeEsquive = 1
    e.ralentiJusqua = -99
    e.stunJusqua = -99
    e.stunDepuis = -99
    e.plongeon = 'aucun'
    e.dernierPlongeonA = -99
    e.finRecuperation = -99
    e.sautInterditJusqua = -99
    e.maintienDepuis = -99
    e.lourdPendantCeMaintien = false
    e.dernierLourdA = -99
    e.attaqueEnCours = 'aucun'
    e.attaqueAnnuleeA = -99
    e.comboEtape = -1
    e.coupEnAttente = false
    e.tourbillon = 0
    e.tourDemande = false
    e.dernierTourA = -99
    e.ruee = 'aucun'
    e.finPoussee = -99
    e.yaw = Math.atan2(e.pos.x, e.pos.z)
    e.dernierCoupA = -99
    e.finSwing = -99
    e.invulnJusqua = this.temps + PROTECTION_APPARITION
    e.dernierDegatSubiA = -99
    e.contributeurs.clear()
    e.entree.attaqueMaintenue = false
    e.entree.speciale = false
    e.entree.specialeMaintenue = false
    this.evenements.push({ type: 'apparition', entite: e.id })
  }

  /**
   * §2 — le SAS d'entree n'existe pas encore (map vide). En attendant, on
   * apparait sur l'anneau peripherique, jamais au centre : c'est deja le
   * gradient spatial, et le camping de spawn n'a rien a camper.
   */
  private pointApparition(): Vec3 {
    const points = this.carte.apparitions
    if (points.length === 0) return v3(0, this.carte.hauteurSol, 0)
    const p = points[this.indexApparition % points.length]!
    // On saute de deux pour eviter deux apparitions consecutives cote a cote.
    this.indexApparition = (this.indexApparition + 3) % points.length
    const jitter = 2.5
    return v3(
      p.x + (Math.random() - 0.5) * jitter,
      this.carte.hauteurSol,
      p.z + (Math.random() - 0.5) * jitter,
    )
  }
}
