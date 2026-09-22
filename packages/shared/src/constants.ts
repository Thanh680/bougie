/**
 * Tout ce qui se regle est ici, et seulement ici.
 * Chaque bloc renvoie a la section de CLAUDE.md qui le justifie.
 */

// --- Boucle de simulation ---------------------------------------------------
/** Pas fixe : indispensable pour que prediction client et autorite serveur convergent (§4). */
export const TICK_HZ = 60
export const TICK_DT = 1 / TICK_HZ
/** Garde-fou anti spirale-de-la-mort : au-dela on laisse filer le temps. */
export const MAX_TICKS_PAR_FRAME = 5

// --- Deplacement — calibre sur Quake Live -----------------------------------
// Une unite Quake vaut un pouce. Le joueur y fait 72 unites de haut, soit 1.83 m :
// quasiment notre HAUTEUR_ENTITE, donc les vitesses se transposent directement.
//
// Pas de sprint : une seule vitesse, tout le temps, pour tout le monde.

/** Quake Live : 320 ups x 0.0254 = 8.13 m/s. */
export const VITESSE_COURSE = 8.13
/** Quake : accel 10 x maxspeed. */
export const ACCEL_SOL = 81
/**
 * Controle aerien TOTAL : identique au sol. Quake est bien plus bas (~8), mais
 * c'est ce qui autorise le strafe-jump, et sans strafe-jump une acceleration
 * aerienne basse rend le demi-tour en l'air litteralement impossible — il faut
 * 0.8 s pour inverser 8.13 m/s a 20 m/s^2, soit plus que le temps de vol.
 * A 81, l'inversion prend 0.2 s : le saut redevient une manoeuvre, pas un
 * engagement irreversible.
 */
export const ACCEL_AIR = 81
/** Quake : friction 6. */
export const FRICTION_SOL = 6
export const FRICTION_AIR = 0.25
/** Quake : 800 ups^2. */
export const GRAVITE = -20.3
/** Plus haut que Quake (270 ups) : apex ~1.6 m, 0.8 s en l'air. Le temps de vol
 *  doit etre assez long pour qu'une esquive aerienne ait le temps d'exister. */
export const VITESSE_SAUT = 8.1
export const RAYON_ENTITE = 0.45
export const HAUTEUR_ENTITE = 1.8

// --- Esquive laterale -------------------------------------------------------
/**
 * Espace + une direction laterale, au sol comme en l'air. Deplacement pur :
 * AUCUNE invulnerabilite. Des i-frames rendraient le porteur d'aura plus dur a
 * tuer alors qu'il est precisement celui qu'on focalise — c'est ce que §2 rejette.
 * La seule chose que l'esquive fait, c'est vous sortir de la portee.
 */
export const VITESSE_ESQUIVE = 16
/** 16 x 0.22 = 3.5 m parcourus, juste au-dela de la portee de l'epee (3.2 m). */
export const DUREE_ESQUIVE = 0.22

/**
 * Jauge d'esquive, entre 0 et 1. Chaque esquive en coute la moitie : on peut
 * donc en enchainer deux, puis il faut attendre.
 * C'est l'endurance de §3 sous sa forme la plus simple — et c'est le garde-fou
 * qui empeche l'esquive de devenir le mode de deplacement par defaut.
 */
export const COUT_ESQUIVE = 0.5
/** Une demi-jauge (donc une esquive) toutes les 1.4 s, jauge pleine en 2.8 s. */
export const REGEN_ESQUIVE = 0.36

// --- Combat (§3 P1 tranche : coups simples facon Minecraft, pas de garde) ----
/** Le coup est instantane au clic : aucune fenetre de telegraphe a lire.
 *  C'est ce qui rend le systeme insensible au ping (le point qui tuait le RPS). */
/** Assez long pour que la taille se lise : 0.3 s, dont un tiers de frappe. */
export const DUREE_SWING = 0.3

/**
 * Delai entre la decision d'attaquer et le moment ou le coup touche.
 *
 * AUCUNE attaque n'est instantanee. Ce delai laisse l'animation partir avant
 * que les degats tombent, et surtout il rend l'attaque INTERRUPTIBLE : encaisser
 * un coup pendant cette fenetre annule la sienne (voir §S4 League).
 * C'est pour ca qu'un coup normal n'a pas besoin de recul — l'annulation fait
 * le travail que ferait un rebond, sans deplacer personne.
 *
 * Le pari de §3 tient toujours : ce n'est pas une fenetre de LECTURE. Personne
 * n'a a lire l'animation adverse pour choisir une reponse en 120 ms. C'est
 * l'attaquant qui s'expose, et l'annulation est un effet, pas une decision.
 */
export const WINDUP_NORMAL = 0.12
export const WINDUP_LOURD = 0.25
/**
 * Aucune nouvelle attaque tant que le swing precedent n'est pas termine.
 * C'est volontairement la MEME valeur que DUREE_SWING : un swing visible vaut
 * toujours un coup reel, et un coup reel produit toujours un swing entier.
 * Sans ca on pouvait relancer l'animation toutes les 0.1 s et le combat
 * devenait illisible — ce que §5 interdit explicitement.
 * La vraie sanction du clic rapide reste la courbe de charge, pas ce verrou.
 */
export const INTERVALLE_MIN_COUP = DUREE_SWING
/** Degats a charge nulle, en fraction des degats de l'arme (Minecraft : 0.2). */
export const CHARGE_MIN = 0.2
/** Invulnerabilite apres un coup recu. Sans elle, deux attaquants tuent en 1 s. */
export const INVULN_APRES_COUP = 0.4
/** Coup critique : frappe en retombant, charge pleine. Le skill-check du systeme. */
export const MULT_CRITIQUE = 1.5
export const CRIT_VITESSE_CHUTE = -0.2
export const CRIT_CHARGE_MIN = 0.9

// Pas de recul a l'impact — retire volontairement. Encaisser ne deplace plus
// personne : la lecture du coup passe par le flash et l'ecrasement, pas par un
// rebond. Ne pas le reintroduire sans le redemander.

// --- Ralentissement a l'attaque ---------------------------------------------
/**
 * Attaquer engage : on ne frappe pas en gardant sa mobilite, et etre touche
 * coute aussi de la vitesse. C'est ce qui donne au corps a corps une inertie
 * sans jamais ajouter de resistance aux degats.
 * L'esquive annule le ralentissement — c'est sa deuxieme fonction, apres la portee.
 */
export const MULT_RALENTI = 0.45
/** L'attaquant est ralenti exactement le temps de son swing. */
export const DUREE_RALENTI_ATTAQUANT = DUREE_SWING
export const DUREE_RALENTI_TOUCHE = 0.35

// --- Attaque sautee a l'epee (plongeon) -------------------------------------
/** Le personnage se fige en l'air, puis tombe a la verticale sur sa position. */
export const PLONGEON_SUSPENSION = 0.28
/** Chute imposee, bien plus rapide que la gravite : l'impact doit etre sec. */
export const PLONGEON_VITESSE_CHUTE = -26
export const PLONGEON_DEGATS = 26
export const PLONGEON_PORTEE = 3.6
export const PLONGEON_DEMI_ANGLE = (85 * Math.PI) / 180
export const PLONGEON_STUN = 0.8
/**
 * Recuperation apres l'impact : aucun controle du personnage, ni deplacement,
 * ni saut, ni attaque, ni esquive. C'est le prix du plongeon.
 * Sans elle on peut resauter des l'atterrissage et enchainer les plongeons :
 * l'attaque la plus forte du jeu devient aussi la plus spammable.
 * Volontairement non annulable — une esquive qui l'annulerait la rendrait
 * gratuite pour qui a de la jauge.
 */
export const RECUPERATION_PLONGEON = 0.5
/**
 * Un ennemi etourdi est totalement bloque pendant ce delai. Passe ce cap il peut
 * s'extraire avec une esquive, qui lui coute une demi-jauge.
 * C'est le seul blocage de controle du jeu : il est court, il est annulable, et
 * il coute une ressource a celui qui s'en sort. Sans ces trois conditions ce
 * serait une immobilisation, et une immobilisation sur le porteur d'aura serait
 * bien plus qu'un ralentissement.
 */
export const STUN_DELAI_AVANT_ESQUIVE = 0.3

// --- Coup lourd -------------------------------------------------------------
/**
 * Seuil qui separe un CLIC d'un MAINTIEN (Plasma Sword de S4 League).
 *
 * Rien ne part a l'appui : on attend de savoir de quel geste il s'agit.
 * Relache avant ce delai, c'est un coup normal. Toujours enfonce a ce delai,
 * c'est un coup lourd — il n'y a pas de barre a remplir, le maintien suffit.
 * C'est ce qui evite qu'un coup normal precede systematiquement un coup lourd.
 */
export const SEUIL_CLIC_MAINTIEN = 0.18
export const LOURD_DEGATS = 30
export const LOURD_PORTEE = 3.4
export const LOURD_DEMI_ANGLE = (60 * Math.PI) / 180
/** Poussee purement horizontale : on repousse, on ne fait pas rebondir.
 *  ~2 m parcourus avant que la friction ait tout mange. */
export const LOURD_POUSSEE = 14
export const LOURD_STUN = 0.35
export const LOURD_SWING = 0.4
export const LOURD_RECUPERATION = 0.3
// Pas de recharge : c'est l'immobilite pendant la charge qui fait office de cout.

// --- Ruee (clic droit) ------------------------------------------------------
/**
 * Une charge en ligne droite, direction figee au depart. C'est un outil
 * d'engagement, pas de fuite : elle ne se pilote pas, et s'en servir pour
 * s'echapper oblige a tourner le dos.
 */
export const RUEE_VITESSE = 18
export const RUEE_DISTANCE = 7
export const RUEE_DEGATS = 12
export const RUEE_STUN = 0.35
export const RUEE_RAYON_IMPACT = 1.35
/**
 * Pas de recharge non plus, mais une recuperation quand la ruee ne touche rien.
 *
 * Elle n'est pas decorative : 7 m en 0.39 s font 18 m/s de moyenne, donc sans
 * elle la ruee serait le moyen de deplacement le plus rapide du jeu et
 * demolirait la regle « une seule vitesse pour tout le monde ».
 * A 0.55 s, la moyenne retombe a 7 / 0.94 = 7.4 m/s, sous les 7.7 m/s reels
 * d'une course lancee. Ruer pour avancer devient une perte de temps.
 */
export const RUEE_RECUPERATION = 0.55
/**
 * Invulnerabilite reduite apres l'impact de ruee.
 *
 * L'invulnerabilite normale de 0.4 s bloquerait le coup lourd que la ruee
 * enchaine (il arrive a WINDUP_LOURD). La ruee et son coup lourd sont un seul
 * geste, pas deux attaques successives : on raccourcit donc la fenetre.
 */
export const RUEE_INVULN = 0.15

// --- Points de vie et niveaux (§2) ------------------------------------------
export const PV_BASE = 100
/**
 * SEUL effet mecanique du niveau, et il est volontairement quasi nul (§2).
 * Marque "a confirmer" dans CLAUDE.md : mettre 100 ici rend le niveau
 * purement cosmetique, ce qui reste une option valide.
 */
export const PV_AU_NIVEAU_MAX = 140
export const NIVEAU_MAX = 20

// AUCUN bonus de degats, de vitesse, de mobilite ou de regeneration.
// Verrouille (§2, §9). Ne pas ajouter de constante ici.

// --- Experience -------------------------------------------------------------
/** §2 anti-farm : l'XP depend de ce que portait la victime et de sa serie.
 *  Un joueur nu ne rapporte quasi rien, sans avoir besoin d'une regle explicite. */
export const XP_BASE_KILL = 25
export const XP_PAR_NIVEAU_VICTIME = 10
export const XP_PAR_SERIE_VICTIME = 30

// --- Mort et reapparition ---------------------------------------------------
export const DELAI_REAPPARITION = 2.5
/**
 * Placeholder du SAS d'entree (§2). Sur une map vide il n'y a pas de salle :
 * on apparait sur l'anneau peripherique avec une courte protection.
 * A remplacer par le vrai sas des qu'il y a de la geometrie.
 */
export const PROTECTION_APPARITION = 1.5

// --- Paliers de serie (§2) --------------------------------------------------
/**
 * §3 PRIORITE 2 — la distance a laquelle on percoit le palier est probablement
 * la variable la plus importante du jeu. Ces trois nombres sont EXACTEMENT
 * le curseur a regler : trop court, la coalition n'emerge jamais.
 */
export const PORTEE_AURA_PALIER_1 = 35
export const PORTEE_AURA_PALIER_2 = 70
export const PORTEE_AURA_PALIER_3 = Infinity

// --- Regeneration hors combat ----------------------------------------------
/** Sans elle un prototype solo devient injouable apres trois echanges.
 *  Volontairement lente et coupee des qu'on prend un coup : ce n'est pas une
 *  recompense de palier, c'est la meme regle pour tout le monde (§2). */
export const REGEN_PV_PAR_SECONDE = 4
export const REGEN_DELAI_APRES_DEGATS = 6

// --- Prototype local --------------------------------------------------------
export const NB_MANNEQUINS = 5
export const MANNEQUIN_PV = 70
export const MANNEQUIN_PORTEE_AGGRO = 26
