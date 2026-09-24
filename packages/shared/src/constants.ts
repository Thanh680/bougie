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

// --- Stamina ----------------------------------------------------------------
/**
 * Une seule reserve pour l'esquive et pour les coups speciaux des armes qui en
 * consomment — la double epee et le marteau —, comme la jauge de SP de S4
 * League. Elle se regenere en continu, au meme rythme pour tout le monde : rien
 * ici ne depend du palier (§2).
 *
 * C'est l'endurance de §3, et le garde-fou qui empeche l'esquive de devenir le
 * mode de deplacement par defaut : une esquive coute la moitie de la reserve,
 * on en enchaine deux, puis il faut attendre. Et chaque coup special paye en
 * stamina, c'est une esquive de moins pour se sortir de la riposte.
 */
export const STAMINA_MAX = 100
export const COUT_ESQUIVE = 50
/** Une esquive toutes les 1.4 s, reserve pleine en 2.8 s. */
export const REGEN_STAMINA = 36

// --- Combat (§3 P1 tranche : coups simples facon Minecraft, pas de garde) ----
// La duree d'un coup normal depend de l'arme : ARMES[].dureeSwing (combat.ts).

/**
 * Delai entre la decision d'attaquer et le moment ou le coup touche.
 *
 * AUCUNE attaque n'est instantanee. Ce delai laisse l'animation s'armer avant
 * que les degats tombent, et surtout il rend l'attaque INTERRUPTIBLE : encaisser
 * un coup pendant cette fenetre annule la sienne (voir §S4 League).
 * C'est pour ca qu'un coup normal n'a pas besoin de recul — l'annulation fait
 * le travail que ferait un rebond, sans deplacer personne.
 *
 * Comme dans un jeu de combat facon Street Fighter, le coup fort part bien plus
 * tard que le coup moyen : un coup normal lance pendant l'armement d'un coup
 * lourd arrive avant lui, et l'annule.
 *
 * Le pari de §3 tient toujours : ce n'est pas une fenetre de LECTURE. Personne
 * n'a a lire l'animation adverse pour choisir une reponse. C'est l'attaquant
 * qui s'expose, et l'annulation est un effet, pas une decision.
 */
export const WINDUP_NORMAL = 0.2
/** A compter de la reconnaissance du maintien : 0.63 s apres l'appui. */
export const WINDUP_LOURD = 0.45
// Aucune nouvelle attaque tant que l'animation de la precedente n'est pas
// terminee (`finSwing`) : un swing visible vaut toujours un coup reel, et un
// coup reel produit toujours un swing entier. Sans ca on pouvait relancer
// l'animation toutes les 0.1 s et le combat devenait illisible — ce que §5
// interdit. La jauge sous le reticule montre exactement ce verrou. Plus de
// courbe de degats facon Minecraft : on ne peut plus frapper avant que la
// jauge soit pleine, chaque coup porte donc ses degats pleins.

/** Invulnerabilite apres un coup recu. Sans elle, deux attaquants tuent en 1 s. */
export const INVULN_APRES_COUP = 0.4

// Pas de recul a l'impact — retire volontairement. Encaisser ne deplace plus
// personne : la lecture du coup passe par le flash et l'ecrasement, pas par un
// rebond. Ne pas le reintroduire sans le redemander.

// --- Ralentissement a l'attaque ---------------------------------------------
/**
 * Attaquer engage : on ne frappe pas en gardant sa mobilite, et etre touche
 * coute aussi de la vitesse. C'est ce qui donne au corps a corps une inertie
 * sans jamais ajouter de resistance aux degats.
 * L'esquive annule le ralentissement — c'est sa deuxieme fonction, apres la portee.
 * L'attaquant est ralenti exactement le temps de son swing, coup lourd compris.
 */
export const MULT_RALENTI = 0.45
export const DUREE_RALENTI_TOUCHE = 0.35

// --- Attaque sautee a l'epee et a la hache (plongeon) -----------------------
/** Le personnage se fige en l'air, puis tombe a la verticale sur sa position. */
export const PLONGEON_SUSPENSION = 0.28
/** Chute imposee, bien plus rapide que la gravite : l'impact doit etre sec. */
export const PLONGEON_VITESSE_CHUTE = -26
/**
 * Longue hache : plongeon EN AVANT, facon Counter Sword. Une suspension bien
 * plus courte que celle de l'epee — le temps de lever la hache et de viser —,
 * puis on fond sur le point vise, toujours a cette distance et en ce temps,
 * quelle que soit la hauteur : la descente est calculee pour toucher le sol
 * pile au bout. Direction figee au depart. A l'impact, l'onde frappe tout autour.
 */
export const PLONGEON_AVANT_SUSPENSION = 0.1
export const PLONGEON_AVANT_DISTANCE = 4
export const PLONGEON_AVANT_DUREE = 0.18
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
 * gratuite pour qui a de la stamina.
 */
export const RECUPERATION_PLONGEON = 0.5
/**
 * Un ennemi etourdi est totalement bloque pendant ce delai. Passe ce cap il peut
 * s'extraire avec une esquive, qui lui coute sa stamina comme toute esquive.
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
 * Un maintien ne donne qu'UN coup lourd : pour en relancer un, il faut relacher.
 */
export const SEUIL_CLIC_MAINTIEN = 0.18
export const LOURD_DEGATS = 30
// La portee du coup lourd depend de l'arme : ARMES[].porteeLourd (combat.ts).
export const LOURD_DEMI_ANGLE = (60 * Math.PI) / 180
/**
 * Projection : la cible decolle et part loin en arriere. En l'air la friction
 * ne mange presque rien, donc c'est le temps de vol qui fait la distance, pas
 * la vitesse horizontale.
 */
export const LOURD_POUSSEE = 8
/** Vitesse verticale donnee a la cible : apex 1.2 m, 0.69 s en l'air. */
export const LOURD_ELAN = 7
/**
 * Une cible projetee reste etourdie pendant tout son vol, plus ce court temps
 * au sol. Le controle aerien est total : rendu en plein vol, il laisserait la
 * cible annuler sa propre projection en 0.1 s. La sortie par esquive reste
 * possible (STUN_DELAI_AVANT_ESQUIVE).
 */
export const STUN_APRES_ATTERRISSAGE = 0.1
/** Projection legere : dernier coup de l'enchainement et dernier tour du
 *  tourbillon. A peine decollee, ~2.5 m en arriere. */
export const LEGERE_POUSSEE = 6
export const LEGERE_ELAN = 3.5
/**
 * Duree totale de l'animation : armement et frappe (WINDUP_LOURD), puis retour.
 * On garde le controle pendant tout ce temps, ralenti, et on peut sauter. Pas
 * de recharge : ce qui limite le coup lourd, c'est son long armement annulable
 * et le fait de ne rien pouvoir lancer d'autre avant la fin — ni coup, ni ruee,
 * ni esquive (elle laverait le ralentissement).
 */
export const LOURD_SWING = 1

// --- Longue hache : enchainement (clic gauche) ------------------------------
/**
 * Facon Counter Sword de S4 League : un clic pendant un coup enchaine le
 * suivant des qu'il se termine, jusqu'a trois coups differents ; le troisieme
 * projette un peu. Les degats de chaque coup sont dans ARMES.hache.gestes.
 * Un clic qui arrive juste apres la fin du coup enchaine encore, dans cette
 * fenetre ; au-dela, on repart du premier.
 */
export const COMBO_FENETRE = 0.25
/**
 * Chaque geste de la hache frappe deux fois, comme la Counter Sword : le
 * second coup suit le premier de ce delai, dans le meme mouvement. Il passe
 * l'invulnerabilite que le premier vient de donner a sa cible, et n'en donne
 * pas de nouvelle. Vaut aussi pour chaque tour du tourbillon.
 */
export const DELAI_DOUBLE_COUP = 0.15
/**
 * Petite ruee en avant pendant chaque geste, comme en S4 League : le corps
 * accompagne le coup, sur ARMES[].gestes[].elan metres, de l'armement jusqu'au
 * premier impact. Elle s'arrete a cette distance d'une cible devant, pour ne
 * pas la bousculer ; encaisser ou esquiver l'arrete aussi.
 */
export const ELAN_ARRET = 1.3

// --- Longue hache : tourbillon (clic droit) ---------------------------------
// Facon tourbillon de la batte de S4 League : un tour a 360 deg par clic, ou
// plusieurs tant qu'on maintient, jamais plus de TOUR_MAX d'affilee. Le
// dernier repousse un peu. On tourne ralenti comme pour toute attaque, et sans
// esquive : sinon le tourbillon devient une sortie d'encerclement, et il
// protege le porteur d'aura (§9).

/** Plus long que INVULN_APRES_COUP : chaque tour peut toucher la meme cible. */
export const TOUR_DUREE = 0.45
/** Au milieu du tour. Annulable avant, comme tout coup. */
export const TOUR_IMPACT = 0.2
export const TOUR_RAYON = 3.2
export const TOUR_DEGATS = 12
export const TOUR_MAX = 3
/** Retour en garde apres le dernier tour : aucun coup avant la fin. */
export const TOUR_RECUPERATION = 0.35
/** Chaque tour frappe deux fois, comme un geste de la hache. */
export const TOUR_COUPS = 2

// --- Double epee : les coups de la Death Scythe de S4 League ----------------
// Enchainement au clic (ARMES.doubleEpee.gestes), coup fort au maintien qui
// frappe deux fois dans le dos, uppercut au clic droit, fauchage en l'air. Les
// deux derniers consomment de la stamina.

/** 3e geste de l'enchainement : la cible trebuche, etourdie ce temps-la. */
export const CROC_STUN = 0.55

/**
 * Coup fort pris dans le dos : la cible est etourdie et un second coup tombe
 * COUP_DOS_DELAI plus tard. « Dans le dos » : l'attaquant est a moins de
 * COUP_DOS_DEMI_ANGLE de l'arriere de la cible. C'est un bonus de coalition :
 * celui qu'on encercle a toujours quelqu'un dans le dos.
 */
export const COUP_DOS_DEMI_ANGLE = (70 * Math.PI) / 180
export const COUP_DOS_STUN = 0.5
/** Sous STUN_DELAI_AVANT_ESQUIVE : on ne s'extrait pas entre les deux coups. */
export const COUP_DOS_DELAI = 0.25
export const COUP_DOS_DEGATS = 30

/**
 * Uppercut (clic droit), au sol seulement : le porteur ET les cibles devant lui
 * decollent haut, qu'il ait touche ou non. En l'air il enchaine le fauchage,
 * esquive, ou retombe ; la cible, etourdie pendant son vol, peut en sortir par
 * une esquive apres STUN_DELAI_AVANT_ESQUIVE.
 */
export const UPPERCUT_COUT = 40
export const UPPERCUT_IMPACT = 0.25
export const UPPERCUT_DEGATS = 15
export const UPPERCUT_PORTEE = 3.2
export const UPPERCUT_DEMI_ANGLE = (60 * Math.PI) / 180
/** Apex 2.5 m, 1 s en l'air : bien plus haut qu'un saut (1.55 m). */
export const UPPERCUT_ELAN = 10
/** De quoi ecarter les capsules, pas une projection. */
export const UPPERCUT_POUSSEE = 1.5
/** De l'impact au premier fauchage possible. Le fauchage frappe ainsi apres
 *  l'invulnerabilite que l'uppercut vient de donner (0.15 + 0.28 > 0.4). */
export const UPPERCUT_RECUPERATION = 0.15

/**
 * Fauchage aerien (clic gauche en l'air) : le porteur flotte le temps du geste,
 * frappe un large arc devant lui et projette. Une fois lance, plus rien : il
 * retombe sans aucun controle, ni deplacement ni esquive, jusqu'au sol, puis
 * FAUCHE_RECUPERATION. C'est son prix, en plus de la stamina.
 */
export const FAUCHE_COUT = 30
/** Suspension ; l'impact tombe a sa fin, et le geste est annulable avant. */
export const FAUCHE_SUSPENSION = 0.28
export const FAUCHE_DEGATS = 24
export const FAUCHE_PORTEE = 3.6
export const FAUCHE_DEMI_ANGLE = (120 * Math.PI) / 180
export const FAUCHE_POUSSEE = 8
export const FAUCHE_ELAN = 4
export const FAUCHE_RECUPERATION = 0.3

// --- Marteau : les coups du Breaker de S4 League ----------------------------
// Un balayage lent a 270 deg qui projette (ARMES.marteau), une charge au clic
// droit qui ecrase le sol devant — la seule chose qu'il paye en stamina — et
// une frappe sautee rapide. Pas de coup lourd au maintien : le Breaker n'en a
// pas. On ne bouge pas pendant ses coups au sol.

/** Delai d'impact du balayage : le double des 0.2 s des autres armes. */
export const MARTEAU_WINDUP = 0.4

/** Charge (clic droit maintenu) : ralenti, ni saut, ni esquive, ni autre coup.
 *  Payee au depart : encaisser pendant la charge la perd. */
export const CHARGE_COUT = 40
/** Charge pleine au bout de ce temps. On peut la tenir plus, sans gain. */
export const CHARGE_DUREE = 1
/** Du relachement a l'impact : sans charge, presque aussi vite qu'un balayage. */
export const ECRASEMENT_WINDUP = 0.3
export const ECRASEMENT_DEGATS_MIN = 20
export const ECRASEMENT_DEGATS_MAX = 42
/** La zone : un disque de ECRASEMENT_RAYON centre ECRASEMENT_DISTANCE devant. */
export const ECRASEMENT_DISTANCE = 2
export const ECRASEMENT_RAYON = 2.8
/** Les cibles decollent a peine (apex 0.9 m), etourdies pendant le vol. */
export const ECRASEMENT_POUSSEE = 3
export const ECRASEMENT_ELAN = 6
/** Retour court : le balayage s'enchaine presque aussitot. */
export const ECRASEMENT_RECUPERATION = 0.25

/** Frappe sautee (clic gauche en l'air) : une par saut, sans suspension. */
export const SAUTEE_WINDUP = 0.22
export const SAUTEE_DEGATS = 30
export const SAUTEE_PORTEE = 4.2
export const SAUTEE_DEMI_ANGLE = (90 * Math.PI) / 180
export const SAUTEE_STUN = 0.3
/** Duree totale, recuperation comprise : courte, c'est ce qui la rend spammable. */
export const SAUTEE_DUREE = 0.5

// --- Ruee (clic droit) ------------------------------------------------------
/**
 * Une charge en ligne droite, direction figee au depart. C'est un outil
 * d'engagement, pas de fuite : elle ne se pilote pas, et s'en servir pour
 * s'echapper oblige a tourner le dos.
 *
 * Elle se conclut TOUJOURS par un coup lourd, qu'elle ait touche ou non, et
 * celui-la interdit de sauter. Pas de recharge : c'est ce coup lourd — une
 * seconde ralenti, sans ruee ni saut — qui l'empeche de devenir le moyen de
 * deplacement le plus rapide du jeu. 7 m en 0.39 s font 18 m/s, mais la
 * moyenne sur un cycle retombe sous la course.
 */
export const RUEE_VITESSE = 18
export const RUEE_DISTANCE = 7
export const RUEE_DEGATS = 12
export const RUEE_STUN = 0.35
export const RUEE_RAYON_IMPACT = 1.35
/**
 * Invulnerabilite reduite apres l'impact de ruee.
 *
 * Elle existait pour que l'invulnerabilite normale (0.4 s) ne bloque pas le
 * coup lourd enchaine. Depuis que WINDUP_LOURD la depasse, le combo n'en a plus
 * besoin ; il lui reste un effet : les autres peuvent frapper la cible ruee
 * plus tot. Redevient indispensable si WINDUP_LOURD repasse sous 0.4 s.
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
/** Mannequin de test : son compteur se remet a zero apres tant de secondes sans coup. */
export const MESURE_REINITIALISATION = 3
export const MANNEQUIN_PV = 70
export const MANNEQUIN_PORTEE_AGGRO = 26
