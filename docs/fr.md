# APC UPS Daemon

Suivez vos onduleurs APC dans Gladys grâce à **apcupsd**, le démon qu'utilisent
Unraid, de nombreux NAS et serveurs Linux pour surveiller leur onduleur :
coupures de courant, charge de la batterie, autonomie, charge, tensions,
estimation de la puissance consommée par vos équipements et de son énergie. Les
scènes peuvent réagir à une coupure de courant, au retour du courant, à une
batterie faible et à une batterie à remplacer.

> **Développée sans le matériel : vos retours sont les bienvenus.**
> L'intégration a été construite et testée avec de vraies réponses d'apcupsd
> publiées par d'autres projets, pas avec un onduleur sur le bureau. Si quelque
> chose cloche avec votre modèle, ouvrez une issue sur GitHub avec la sortie de
> `apcaccess status` (masquez le numéro de série).

Cette intégration n'est affiliée ni à APC ni à Schneider Electric.

## Prérequis

- Gladys Assistant 5.1.0 ou plus récent.
- Un onduleur branché (câble USB ou série) à un ordinateur où tourne
  **apcupsd** : serveur Linux, NAS, serveur Unraid, Raspberry Pi…
- Le **serveur d'information réseau** (NIS) d'apcupsd activé et à l'écoute sur
  le réseau, sur le port 3551 (par défaut). C'est le service en lecture seule
  qu'utilisent `apcaccess` et Home Assistant.

### apcupsd sous Linux ou Windows

Dans `apcupsd.conf` (en général `/etc/apcupsd/apcupsd.conf`), vérifiez ces
trois lignes :

```
NETSERVER on
NISIP 0.0.0.0
NISPORT 3551
```

`NISIP 127.0.0.1` (la valeur par défaut de certaines distributions) ne répond
qu'à l'ordinateur lui-même : Gladys, dans son conteneur, est refusé. Redémarrez
apcupsd après la modification (`sudo systemctl restart apcupsd`), puis vérifiez
depuis un autre ordinateur que le port 3551 répond.

### Unraid

Unraid fait tourner apcupsd lui-même : ouvrez **Settings → UPS Settings**,
activez l'option du serveur réseau (« Enable network server ») et appliquez. Si
l'intégration reçoit encore « connexion refusée », le serveur n'écoute que sur
l'ordinateur Unraid : vérifiez la ligne `NISIP` de `/etc/apcupsd/apcupsd.conf`
sur Unraid.

## Configuration

Dans Gladys, ouvrez **Intégrations → APC UPS Daemon → Configuration** :

- **Serveurs apcupsd** : l'adresse IP de l'ordinateur où tourne apcupsd, suivie
  de `:port` si le port n'est pas 3551. Un apcupsd sert un onduleur : pour
  plusieurs onduleurs, saisissez plusieurs serveurs séparés par des virgules,
  par exemple `192.0.2.10, 192.0.2.11:3552`. Préférez les adresses IP : les
  noms en `.local` ne se résolvent pas dans le conteneur de l'intégration.
- **Intervalle de rafraîchissement** : 5, 10 (par défaut), 30 secondes ou
  1 minute. Une coupure de courant est vue dans ce délai.
- **Langue des textes des appareils** : la langue des noms de fonctionnalités
  des nouveaux appareils et des textes affichés par l'onduleur (état, raison du
  dernier transfert). Le français par défaut.

Le bouton **Vérifier les serveurs** lit chaque serveur et indique lesquels
répondent, avec leur modèle, ou pourquoi ils ne répondent pas.

Ouvrez ensuite l'onglet **Découverte** et ajoutez votre onduleur à Gladys.

## L'appareil onduleur

Chaque onduleur est un appareil. Une fonctionnalité n'existe que si votre
onduleur fournit la valeur correspondante (un Back-UPS n'a pas de température
interne, un vieux Smart-UPS pas de puissance nominale). Tout est en lecture
seule : le serveur réseau d'apcupsd ne sait pas envoyer de commande, et aucun
bouton n'éteint un onduleur.

| Fonctionnalité                                  | Ce qu'elle montre                                                                                   |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| État                                            | L'état en mots : Sur secteur, Sur batterie, Batterie faible, Batterie à remplacer, Surcharge…       |
| Secteur                                         | On (1) sur secteur, Off (0) pendant une coupure : la valeur à utiliser dans les conditions de scène |
| Batterie faible                                 | Oui quand l'onduleur signale une batterie faible : l'arrêt est proche                               |
| Charge batterie                                 | Charge de la batterie, en %                                                                         |
| Autonomie                                       | Autonomie restante sur batterie, en minutes, estimée par l'onduleur                                 |
| Charge                                          | Charge de l'onduleur, en % de sa capacité                                                           |
| Puissance                                       | Puissance consommée par vos équipements, en W, **estimée** : charge × puissance nominale            |
| Énergie                                         | Énergie cumulée, en kWh, calculée d'après la puissance (voir plus bas)                              |
| Tension d'entrée / de sortie / batterie         | En volts                                                                                            |
| Température interne                             | En °C                                                                                               |
| Temps sur batterie / Temps cumulé sur batterie  | Coupure en cours, et depuis le démarrage d'apcupsd, en secondes                                     |
| Nombre de transferts                            | Nombre de passages sur batterie depuis le démarrage d'apcupsd                                       |
| Dernier transfert / Raison du dernier transfert | Date et raison du dernier passage sur batterie (autotest, tension secteur trop basse…)              |
| Date de la batterie, Modèle, Numéro de série    | Tels que l'onduleur les donne                                                                       |

### Suivi d'énergie

apcupsd donne une charge en pourcentage, pas un compteur d'énergie. Quand
l'onduleur indique sa puissance nominale, l'intégration estime la puissance
(charge × puissance nominale) et la cumule dans le temps en un index
**Énergie**, en kWh. Gladys transforme cet index en consommation toutes les
30 minutes et en coût, comme pour une prise connectée : l'écran **Énergie** de
Gladys montre alors ce que consomme votre coin serveur. L'index est conservé
dans les données de l'intégration : il ne recule jamais quand l'intégration
redémarre. C'est une estimation : comptez quelques pourcents d'erreur, et
davantage à très faible charge.

## Widget

Le widget **Onduleur** affiche, pour l'onduleur choisi dans ses réglages (le
premier ajouté par défaut), l'état en mots avec une couleur (vert sur secteur,
orange sur batterie ou batterie à remplacer, rouge pour une batterie faible,
une surcharge ou un onduleur muet), le dernier transfert, et des tuiles en
direct pour la charge de la batterie, l'autonomie, la charge et la puissance
estimée.

## Déclencheurs de scène

Quatre déclencheurs, dans l'éditeur de scènes sous le nom de l'intégration.
Chacun peut surveiller un onduleur, ou n'importe lequel si le champ reste vide.

| Déclencheur                     | Quand                                            | Variables                                                     |
| ------------------------------- | ------------------------------------------------ | ------------------------------------------------------------- |
| Onduleur : coupure de courant   | l'onduleur passe sur batterie                    | nom de l'onduleur, charge de la batterie, autonomie           |
| Onduleur : courant rétabli      | l'onduleur revient sur secteur après une coupure | nom de l'onduleur, charge de la batterie, durée de la coupure |
| Onduleur : batterie faible      | l'onduleur signale une batterie faible           | nom de l'onduleur, charge de la batterie, autonomie           |
| Onduleur : batterie à remplacer | l'onduleur demande une batterie neuve            | nom de l'onduleur, date de la batterie                        |

Un déclencheur se déclenche une fois par changement, jamais sur la première
lecture après un démarrage. Un changement survenu pendant un redémarrage de
l'intégration déclenche quand même, si le redémarrage dure moins de
30 minutes.

## Exemples de scènes

### Me prévenir d'une coupure de courant

Déclencheur **Onduleur : coupure de courant**, action **Envoyer un message** :
« Coupure de courant ! [Nom de l'onduleur] est sur batterie, [Charge de la
batterie] % restants, environ [Autonomie] minutes. » Les mots entre crochets
sont les variables du déclencheur : tapez `{{` dans le message pour les
insérer.

### Éteindre le superflu pendant une coupure

Déclencheur **Onduleur : coupure de courant**, actions : éteindre les prises
des écrans, de l'imprimante et des lumières alimentées par l'onduleur, pour
faire durer la batterie.

### Me dire quand le courant revient

Déclencheur **Onduleur : courant rétabli**, action **Envoyer un message** :
« Le courant est revenu après [Durée de la coupure] secondes. »

## Dépannage

- **« connexion refusée »** : le serveur réseau d'apcupsd est éteint, ou
  n'écoute que sur l'ordinateur d'apcupsd (`NISIP 127.0.0.1`). Voir les
  prérequis.
- **« pas de réponse »** : mauvaise adresse ou mauvais port, ou pare-feu entre
  Gladys et l'ordinateur d'apcupsd. Le port 3551 doit être ouvert en TCP.
- **« nom inconnu »** : saisissez l'adresse IP plutôt que le nom.
- **L'État indique « Onduleur muet »** : apcupsd répond, mais a perdu
  l'onduleur lui-même (câble USB, pilote). Regardez du côté de l'ordinateur
  d'apcupsd.
- **Pas de fonctionnalité Puissance ni Énergie** : votre onduleur n'indique
  pas sa puissance nominale (`NOMPOWER` dans `apcaccess status`).
- **Journaux** : l'intégration n'écrit que son démarrage, les serveurs
  trouvés, les coupures et les erreurs. Mettez `LOG_LEVEL=debug` sur le
  conteneur pour voir chaque lecture.

## Limites

- Une coupure plus courte que l'intervalle de rafraîchissement peut passer
  inaperçue (le compteur de transferts la compte quand même).
- La puissance et l'énergie sont des estimations, pas des mesures.
- Le nombre de transferts et les temps sur batterie repartent de zéro quand
  apcupsd redémarre.
- Lecture seule : ni autotest, ni arrêt, ni changement de réglage depuis
  Gladys.
- Développée sans le matériel : testée avec de vrais états d'apcupsd (Back-UPS
  ES 600, SMART-UPS 1400, un vieil apcupsd 3.8) et un serveur simulé.
- Pour un onduleur surveillé par NUT plutôt que par apcupsd, utilisez une
  intégration NUT.
