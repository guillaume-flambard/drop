# Interface (UX_UI)

Document descriptif. Les contrats normatifs vivent dans openspec/specs ; l'ordre dans docs/TASKS.md ; les décisions dans docs/DECISIONS.md.

Ce document décrit les surfaces de drop, les écrans tels qu'ils existent dans le code et ceux qui sont visés. Les parcours qui relient ces écrans sont dans [APP_FLOW](APP_FLOW.md). Le contrat de l'app est dans la spec [owner-app](../../openspec/specs/owner-app/spec.md) ; celui de la carte de consentement et de la relecture dans la spec [node](../../openspec/specs/node/spec.md).

## Lire ce document

- **Existant** : présent dans le code. Sauf mention, la source est le panneau React `packages/desktop-ui/src/panel/` (T4.24, D97), servi par `packages/node/src/workspace.ts`.
- **Visé** : cible adoptée, livrée par la tâche citée.
- **Hypothèse** : supposition non vérifiée, avec son critère.

**Hypothèse** : aucun écran n'a été testé avec de vrais utilisateurs (`PRODUCT.md`, section « Evidence on Hand »). Critère : l'essai T4.6 observe chaque écran principal.

## 1. Principes

1. **Existant** (D46, contraignant) : un panneau Mac discret et familier, en typographie système, avec la palette neutre existante.
2. **Existant** (D46, couleur changée par D88) : l'accent sert aux actions et aux états, jamais à la décoration. Depuis le 11 octobre 2026, l'accent est violet dans la fenêtre « Ton espace » (React, D87) et, depuis T4.24 (D97), dans le panneau, construit avec les mêmes composants et jetons.
3. **Existant** (D46) : le clavier et VoiceOver passent avant toute décoration. Les onglets, l'annonce des résultats et le focus sont décrits en section 6. La recette VoiceOver réelle reste à faire (T3.4).
4. **Existant** : tout texte écrit par un pair est rendu comme texte par React, jamais comme HTML ; aucun `dangerouslySetInnerHTML` ni `innerHTML` dans le panneau (spec owner-app « Texte des pairs inerte », vérifié par test).
5. **Existant** : la carte de décision montre ce qui sort et ce qui ne sort jamais avant de demander une décision : « Julie recevra » et « Julie ne recevra jamais ».
6. **Existant** : rien n'est partagé sans geste explicite. Raccorder un agent ne partage aucun outil ; « Autoriser une fois » ne donne aucun accès permanent.
7. **Existant** : le panneau parle seulement à son propre Node, sous la politique de contenu `default-src 'none'` : son seul script est autorisé par son empreinte SHA-256, `connect-src 'self'`, ni police, ni image, ni formulaire (`PANEL_CSP`, `packages/node/src/workspace.ts`).
8. **Hypothèse** : décider prend quelques secondes sans vocabulaire technique (`PRODUCT.md`, principe 3). Critère : temps de décision et erreurs de compréhension mesurés en T4.6.

## 2. Surfaces

| Surface                    | Rôle                                                       | Statut et source                                             |
| -------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------ |
| Icône de barre de menus    | Ouvrir ou fermer le panneau, menu de trois actions         | **Existant**, `apps/desktop/src-tauri/src/main.rs`               |
| Panneau                    | Demandes, Équipe, Mes outils ; servi par le Node sur `/app` | **Existant**, `packages/desktop-ui/src/panel/` (React, D97)  |
| Page de démarrage          | États de démarrage et codes de diagnostic                  | **Existant**, `apps/desktop/web/index.html`                      |
| Notifications macOS        | Annoncer une décision ou une relecture en attente          | **Existant**, `packages/node/src/notify.ts`                  |
| Page historique `/`        | Ancienne UI de consentement, avec retrait de champs        | **Existant**, `packages/node/src/ui.ts`                      |
| Page de liaison passerelle | Ouvrir drop pour relier un assistant distant               | **Existant** en code, T2.13 non livrée, `packages/gateway/src/server.ts` |
| Carte de simulation        | Suivre une campagne de simulation                          | **Visé**, T4.7                                               |

## 3. Écrans existants

### 3.1 Coque Mac

- **Existant** (`main.rs`) : fenêtre de 380 × 620, sans bordure, non redimensionnable, toujours au premier plan, absente de la barre des tâches.
- **Existant** : matériau « popover » du système, coins de 12 px, ombre. Le panneau peint dans la fenêtre un fond translucide.
- **Existant** : un clic gauche sur l'icône ouvre le panneau centré sous elle, ou le ferme. Le panneau se cache dès qu'il perd le focus.
- **Existant** : le menu de l'icône contient « Ouvrir drop », « Réessayer le démarrage » et « Quitter drop ».
- **Existant** : l'icône est une image modèle, qui suit le thème de la barre de menus ; l'app n'a pas d'icône dans le Dock.

### 3.2 En-tête et onglets

- **Existant** : en-tête collant et translucide (flou de 20 px) avec le mot « drop. » (point violet) et un état à droite. Une fine bordure apparaît dès que le contenu défile dessous.
- **Existant** : l'état commence par « Connexion… », puis « Prénom · connecté » (point vert), « Prénom · hors ligne » (point ambre) ou « Moteur local indisponible » (point rouge orangé). Il est annoncé par une région vivante polie.
- **Existant** : trois onglets segmentés (Radix Tabs), « Demandes », « Équipe », « Mes outils ». L'onglet actif a un fond de carte et une ombre légère.
- **Existant** : un badge violet sur « Demandes » compte les décisions et relectures en attente, lu « 2 en attente » par VoiceOver ; il disparaît à zéro. Le flux en direct le tient à jour quel que soit l'onglet.

### 3.3 Demandes

Section « À décider ».

- **Existant**, état vide : une carte centrée avec une icône de coche cerclée verte, « Tout est à jour » et « Lorsqu’un collègue aura une question, tu pourras choisir ce qui lui sera transmis. »
- **Existant**, carte de décision, de haut en bas :
  - pastille aux initiales du demandeur, « Julie a besoin d’aide » et « via Claude Code », puis le titre de la capacité ;
  - la question entre guillemets français, sur un fond creusé, en 14 px ;
  - « Pourquoi » en gras, suivi de la raison donnée par l'agent ;
  - un registre à deux lignes : coche couleur d'accent et « Julie recevra », puis cadenas gris et « Julie ne recevra jamais », chacune avec sa liste ;
  - le coût s'il existe : « Coût : gratuit », « Coût max : 0,50 $, à ta charge », « … payé par Julie » ou « Coût : à ta charge, non mesuré » ;
  - « Sensibilité haute : tu reliras le résultat avant envoi. » si la capacité est sensible, puis « Expire dans mm:ss », qui décompte chaque seconde ;
  - les actions : « Pas maintenant » discret à gauche, « Refuser », puis « Autoriser une fois » plein, en couleur d'accent ; « Répondre moi-même » sous un trait.
- **Existant** : chaque bouton porte un nom accessible qui inclut le titre, par exemple « Refuser : Résumer les erreurs de production ».
- **Existant** : une nouvelle carte arrive par un léger glissement de 0,24 s ; une carte décidée s'efface en 0,16 s.
- **Existant**, carte de relecture : pastille « À relire », titre, « Ta réponse est prête. Rien n’est parti. Relis les informations avant de choisir. », la sortie champ par champ (nom, valeur) avec une case « Retirer » par champ (un champ retiré est barré), puis « Ne pas envoyer » et « Envoyer » plein.
- **Existant** : après une action, un bandeau de résultat apparaît et reçoit le focus : « Demande autorisée une fois. », « Demande refusée. », « Demande reportée. », « Réponse envoyée. » ou « Réponse conservée sur ce Mac. »

Section « Mes questions ».

- **Existant** : liste des dix dernières questions envoyées : initiales et nom du destinataire, titre, pastille d'état ; chaque ligne se déplie sur une phrase qui décrit l'état actuel, sans frise inventée.
- **Existant** : états affichés : envoyée, en attente, acceptée, en cours, relue, reçue, refusée, pas maintenant, expirée, échouée.
- **Existant** : couleurs d'état : vert pour reçue, rouge pour refusée ou échouée, neutre pour expirée et pas maintenant, ambre pour le reste.

### 3.4 Équipe

- **Existant**, sans équipe : « Pas encore d’équipe », « Crée-la, puis invite tes collègues : chacun verra les outils des autres. », champ « Nom de l’équipe » (exemple « Ex. Atlas… ») et « Créer l’équipe ». Un nom vide marque le champ invalide, annonce « Donne un nom à l’équipe. » et rend le focus au champ.
- **Existant**, avec équipe : titre « Atlas · 4 membres, 2 en ligne », puis une ligne par membre : initiales, nom (suivi de « (toi) » pour soi), agents ou « aucun agent signalé », pastilles des outils partagés, point et texte « en ligne » ou « hors ligne ».
- **Existant** : « Inviter quelqu’un dans l’équipe » affiche « Envoie ce lien, valable 24 h, une seule fois : », le lien en police à chasse fixe sélectionnable, et « Copier le lien », qui annonce « Lien copié. »

### 3.5 Mes outils

- **Existant**, « Connecter mes agents » : deux étapes numérotées (« Analyse locale des treize clients MCP compatibles, dans leurs fichiers documentés seulement. » puis « Choisis puis confirme les connecteurs à ajouter. Aucun outil ne sera partagé. ») et le bouton « 1. Analyser cet ordinateur ».
- **Existant** : après l'analyse, une ligne par agent trouvé. Prêt : case cochée. Déjà raccordé : « Retirer ce connecteur », confirmé dans une boîte de dialogue. Conflit ou erreur : texte en couleur d'alerte, traduit, avec le code entre parenthèses.
- **Existant** : « 2. Connecter les agents sélectionnés », bouton plein sur toute la largeur.
- **Existant**, état vide : « Aucun des treize clients détecté » et « Tu peux ajouter manuellement le connecteur MCP drop dans ton agent. »
- **Existant**, voie manuelle : une ligne d'aide permanente, puis après l'analyse une carte « Configuration manuelle » avec l'entrée JSON et « Copie cette entrée dans la configuration MCP de ton agent, puis relance-le. Cela ne partage aucun outil. »
- **Existant**, « Mes outils » : « Partager un outil, c’est répondre aux questions de l’équipe avec lui, après ton accord. Personne ne reçoit l’accès. » Puis, par agent installé, ses serveurs MCP partageables avec un interrupteur « Partager … » ou « Ne plus partager … ».
- **Existant**, « Assistants reliés » : chaque assistant « peut demander à ton équipe en ton nom », avec « Retirer ».
- **Existant** : une ligne finale indique « Qui paie le modèle : toi » ou « celui qui demande ».

### 3.6 Liens profonds

- **Existant** (T4.14), `drop://pair` : le panneau montre qui invite et l'équipe, comme texte, avec « Refuser » (focus par défaut) et « Rejoindre » ; seul « Rejoindre » appaire, puis l'onglet Équipe s'ouvre sur « Invitation acceptée : tu rejoins l’équipe dans quelques secondes. ». Un lien périmé affiche « Ce lien d’invitation n’est plus valable. Demande-en un nouveau. »
- **Existant**, `drop://link` : carte « Autoriser Claude à demander à ton équipe ? », explication, avertissement en couleur d'alerte si la passerelle n'est pas reconnue, puis « Refuser » et « Autoriser ». En profil privé, l'autorisation échoue (écart E4).
- **Existant** : le code d'invitation et les paramètres de liaison sont retirés de l'adresse dès la lecture ; le jeton local y reste (`history.replaceState`).

### 3.7 États transverses du panneau

- **Existant**, chargement : deux blocs gris de 64 px qui respirent, un texte caché « Chargement… » pour VoiceOver et `aria-busy` sur la zone.
- **Existant**, erreur de chargement : bandeau `role="alert"` « Impossible de charger cette section. Vérifie que drop est ouvert, puis réessaie. » et « Réessayer ».
- **Existant**, action refusée : bandeau d'alerte avec le message du Node, ou « Action impossible. Réessaie dans un instant. »
- **Existant**, hors ligne : point ambre dans l'en-tête ; la liste de l'équipe marque chaque membre hors ligne.
- **Existant**, mise à jour en direct : un flux SSE rafraîchit les demandes, le badge et l'état de l'en-tête. Si le focus est dans un champ, le rafraîchissement attend qu'il en sorte ; React garde brouillons et dépliages en place.
- **Existant**, bouton en cours : inactif et à opacité réduite pendant l'appel.
- **Existant**, bandeau de résultat : il prend le focus, se ferme par « Fermer le message » et disparaît au changement d'onglet.

### 3.8 Page de démarrage

Source : `apps/desktop/web/index.html`.

- **Existant** : en-tête « drop », état vivant « Démarrage local… », titre « Préparation de ton espace » et « Le moteur démarre sur ce Mac. Les échanges passent par l’infrastructure que tu as choisie. »
- **Existant** : en cas d'échec, « Démarrage interrompu », point rouge orangé, un titre et une explication propres au code, « Réessayer » et « Tu peux aussi choisir « Réessayer le démarrage » dans le menu drop de la barre de menus. Code de diagnostic : E_PORT. »
- **Existant** : codes couverts : `E_INIT` (identité), `E_CONFIG` (configuration), `E_PORT` (port), `E_LOG` (journal), `E_SPAWN` (moteur introuvable), `E_START` (moteur muet), `E_TOKEN` (jeton), `E_PANEL` (fenêtre), `E_RESTART` (reprise échouée).
- **Existant** : `E_STATE` est traduit sur cette page depuis T4.14.

### 3.9 Notifications

- **Existant** : « Julie a besoin d'aide » avec le titre de la capacité en sous-titre, et « Résultat à relire avant envoi » avec le titre (`packages/node/src/daemon.ts`).
- **Existant** : le texte des pairs passe en argument, jamais dans le script, et la notification ne contient pas le jeton (D18, `notify.ts`).
- **Existant** : aucune notification sous Windows et Linux ; dans l'app Mac, un clic ouvre le panneau (T4.14).
- **Existant (T4.30)** : dans l'app Mac, la notification d'une décision porte deux actions, « Voir » et « Refuser », jamais « Autoriser », puisqu'elle coupe le texte du pair à 200 caractères. « Voir » et un clic ouvrent le panneau sur la carte complète, le focus sur « Pas maintenant ». « Refuser » passe par le chemin de décision de la carte et ne vaut que si la demande attend encore ; sinon il est ignoré avec `E_NOT_PENDING` ou `E_EXPIRED`. Niveau d'interruption ordinaire : un mode Concentration la garde pour plus tard. Le panneau est exclu du partage d'écran sur macOS et Windows (`content_protected`).

## 4. Écrans visés

Chaque écran ci-dessous est **Visé** par la tâche citée, sauf ceux marqués **Existant** au 11 octobre 2026. Les détails de mise en page marqués **Hypothèse** restent à confirmer pendant la tâche.

### 4.1 Réponse humaine (T4.3)

- **Existant** (T4.3) : sur la carte de décision, une quatrième voie « Répondre moi-même », qui ouvre une zone de texte et un choix de fichier.
- **Existant** (T4.3) : le registre « recevra » et « ne recevra jamais » reste affiché pendant la rédaction.
- **Existant** (T4.3) : avant l'envoi, la même relecture et le même contrôle de secrets qu'une capacité.
- **Hypothèse** : la zone de texte tient dans le panneau de 380 px sans ouvrir de fenêtre. Critère : réponse de 1 500 caractères lisible et modifiable au clavier en T4.3.

### 4.2 Agent inclus (T4.8)

- **Visé** : réglage « Laisser l'agent de drop répondre après mon accord », avec le modèle choisi par le propriétaire.
- **Visé** : la carte montre quel modèle répondra et où il tourne, avant la décision.

### 4.3 Faits publiés (T4.4)

- **Existant** (T4.4) : une liste « Ce que je publie » dans « Mes outils » : énoncé, source, date de validité, public ; actions modifier, retirer.
- **Existant** (T4.4) : un fait expiré passe en grisé et n'est plus servi.
- **Hypothèse** : cette liste vit dans l'onglet « Mes outils ». Critère : les testeurs de T4.6 la trouvent sans aide.

### 4.4 Choix du mode de connexion (T4.2)

- **Existant** (T4.2, T4.2b) : le réseau local est actif sauf désactivation ; « Connexion par Internet » se règle dans le panneau (désactivée, relais iroh choisi, relais de test n0 signalé comme tiers, refusé en profil privé). Un choix guidé au premier lancement reste **Visé**.
- **Visé** : en cas d'échec de la connexion directe, un écran explique ce qui a échoué en phrases simples et propose d'activer un relais : relais de test n0 signalé comme tiers, relais Memo Labs sur demande, relais auto-hébergé. Aucun n'est présélectionné.
- **Visé** : l'en-tête distingue « connecté en direct », « connecté par relais » et « hors ligne ».

### 4.5 Indicateur de politique d'entreprise (T4.10)

- **Visé** : une mention permanente et discrète, par exemple « Géré par ton entreprise », avec le détail de la politique au clic.
- **Visé** : une action interdite par la politique est absente ou désactivée, avec la raison, jamais cachée sans explication.

### 4.6 Jalons d'une tâche déléguée (T4.11)

- **Visé** : une carte de tâche avec budget, échéance et liste des jalons ; chaque jalon attend « Continuer » ou « Arrêter ».
- **Visé** : un élargissement du périmètre est signalé comme une nouvelle demande, avec un nouveau registre « recevra » et « ne recevra jamais ».

### 4.7 Boîte de suggestions (T4.12)

- **Visé** : une liste de propositions venues d'autres agents, chacune avec son auteur, le fait visé et le changement proposé ; actions « Accepter » et « Rejeter ».
- **Visé** : aucune suggestion ne modifie un fait sans ce geste.

### 4.8 Raccordement des treize clients (T4.5)

- **Existant** (T4.5) : la liste de l'analyse couvre les treize clients de D55, en séparant configuration globale et configuration par projet.
- **Existant** (T4.5) : le panneau parle des treize clients ; pour les six sans raccordement automatique, il donne la configuration à copier.

### 4.9 Carte de simulation (T4.7)

Surface locale du paquet de simulation, hors panneau. React Flow est candidat, limité à ce paquet (D56).

- **Visé**, vue équipe : les nœuds regroupables, par exemple par service de l'entreprise fictive.
- **Hypothèse** : une bande de métriques en haut (demandes en cours, latence, refus, erreurs, mémoire). Critère : l'opérateur répond à « où ça coince ? » sans ouvrir les traces en T4.7.
- **Visé**, vue parcours : pour une demande, la suite des étapes, du demandeur à la livraison, nœud par nœud. **Hypothèse** : une présentation proche d'un éditeur de flux comme n8n. Critère : un pas à pas lisible sur une demande à trois destinataires.
- **Visé**, lecture : une frise temporelle avec lecture, pause et pas à pas.
- **Visé**, injection : commandes pour couper un nœud, couper le relais, saturer un quota, injecter une sortie piégée ou un secret.
- **Hypothèse** : les principes de D46 s'appliquent en partie : palette neutre et accent réservé aux états, mais une fenêtre plus grande que le panneau. Critère : décision consignée dans la change de T4.7.

## 5. Voix et textes

- **Existant** : français simple, tutoiement, phrases courtes (`PRODUCT.md`, « Voice »). Exemples : « Rien à décider », « Coche au moins un agent. », « Relance l’analyse. »
- **Existant** : un code d'erreur se traduit en phrase utile, avec le code entre parenthèses : « La configuration a changé depuis l’analyse. Relance l’analyse. (E_CONFIG_CHANGED) » (fonction `explain`). La page de démarrage ajoute « Code de diagnostic : E_PORT. »
- **Existant** : aucun identifiant technique sur la carte de décision : l'agent s'affiche « Claude Code », pas `claude_code` (fonction `agentName`).
- **Existant** : le panneau dit « à ta charge » là où la spec node écrit « à votre charge ». La voix du panneau suit `PRODUCT.md`.
- **Hypothèse** : les erreurs d'une demande (`E_EXPIRED`, `E_DENIED`, `E_OUTPUT_INVALID`, `E_SECRET_DETECTED`, `E_BUDGET`) gagnent à être expliquées dans « Mes questions », pas seulement par un état. Aujourd'hui seul l'agent reçoit le code et le message. Critère : un testeur de T4.6 comprend pourquoi une question a échoué sans demander.
- **Existant** : pas de jargon sur le chemin de décision. Les mots MCP et stdio n'apparaissent que dans « Mes outils », côté configuration (`PRODUCT.md`, « Users »).

## 6. Accessibilité

- **Existant** : onglets Radix en `role="tablist"`, `tab` et `tabpanel`, avec tabindex mobile ; flèches gauche et droite, Début et Fin changent d'onglet et gardent le focus (test de composant).
- **Existant** : une région vivante cachée annonce chaque résultat d'action ; l'état de connexion a sa propre région polie.
- **Existant** : après une action, le focus va au bandeau de résultat ; dans la réponse humaine, il suit le geste (zone de texte, « Envoyer », « Retirer » du fichier). Vérifié par les tests de composants et en prévisualisation 380 × 620 dans Chromium.
- **Existant** : interrupteurs et cases Radix (`role="switch"`, `role="checkbox"`, `aria-checked`) ; icônes en `aria-hidden` ; champs invalides en `aria-invalid` ; erreurs en `role="alert"`.
- **Existant** : contour de focus visible de 2 px en couleur d'accent.
- **Existant** : respect de « réduire les animations », « réduire la transparence » (fond plein, sans flou) et « augmenter le contraste » (bordures plus foncées et plus épaisses).
- **Existant** : apparence claire et sombre selon le système (`color-scheme: light dark`).
- **Existant** : le texte des questions, des champs et du code reste sélectionnable ; le reste de l'interface ne l'est pas, comme un panneau Mac.
- **Visé** (T3.4, T4.24 seconde partie) : recette VoiceOver dans le vrai WKWebView, puis WebView2 et WebKitGTK : focus de chaque chemin de décision, relecture et zoom ; ce n'est pas encore prouvé.
- **Existant** : « Pas maintenant » est le bouton par défaut au clavier : sans focus ailleurs, il le prend à l'arrivée d'une carte, et Entrée émet `not_now` (écart E1 levé par T4.24).

## 7. Jetons de design

### 7.1 Jetons communs à la fenêtre « Ton espace » et au panneau (React et composants shadcn/ui, D87, D88, D97)

**Existant**, valeurs de `packages/desktop-ui/src/styles.css`, compilées et servies par le Node, sans police ni ressource externe. Le panneau et la fenêtre partagent la même feuille de style.

| Jeton                | Clair     | Sombre    | Usage                                   |
| -------------------- | --------- | --------- | --------------------------------------- |
| `--background`       | `#f8f8f7` | `#222127` | Fond                                    |
| `--foreground`       | `#27262b` | `#f3f0f4` | Texte principal                         |
| `--card`             | `#ffffff` | `#2d2b32` | Cartes                                  |
| `--primary`          | `#6660aa` | `#c2b9fc` | Accent violet : actions principales     |
| `--primary-foreground` | `#ffffff` | `#24212e` | Texte sur l'accent                    |
| `--secondary`        | `#f2f1f0` | `#35323b` | Boutons secondaires                     |
| `--muted`            | `#f4f3f2` | `#333139` | Fonds discrets                          |
| `--muted-foreground` | `#77747c` | `#c1b9c4` | Texte secondaire                        |
| `--border`           | `#e9e6e9` | `#46414b` | Bordures                                |
| `--input`            | `#e4e1e6` | `#524c58` | Champs                                  |
| `--ring`             | `#9790d0` | `#bdb4f2` | Contour de focus                        |
| `--destructive`      | `#ac5e61` | `#efadaf` | Refus, erreur                           |

Rayon de base `0.875rem`. Icônes Lucide. Typographie système, corps 14 px sur 1,5.

### 7.2 Panneau (`packages/desktop-ui/src/panel/`, T4.24)

**Existant**, mêmes jetons que 7.1, appliqués sous `html.drop-panel`. Captures fictives claires et sombres dans [screenshots/react-panel](screenshots/react-panel/).

- **Existant**, surface : la fenêtre de 380 × 620 est transparente avec le matériau popover du système ; la page peint `--background` à 92 % par-dessus, l'en-tête à 84 % avec un flou de 20 px. « Réduire la transparence » rend les deux pleins, sans flou.
- **Existant**, rayons : fenêtre 12 px, cartes et listes 16 px, citation, champs et blocs de code 12 px, boutons 10 px, onglet actif 8 px, pastilles en pilule.
- **Existant**, typographie : police système, corps 13 px sur 1,45 ; mot « drop. » 21 px gras ; titre de carte et citation 14 px ; titres de section, texte discret et registre 12 px ; coût, états et compte à rebours 11 px en chiffres tabulaires ; code 11 px en chasse fixe.
- **Existant**, focus : contour de 2 px en `--primary`, décalé de 2 px, sans l'anneau des composants.
- **Existant**, contraste augmenté : bordures de `--border` et `--input` plus foncées (7.1) et de 1,5 px sur cartes, boutons et champs.
- **Existant**, mouvement : arrivée de carte 0,24 s en `cubic-bezier(.23, 1, .32, 1)`, départ 0,16 s (fondu et réduction à 98 %), blocs de chargement qui respirent ; tout est coupé par « réduire les animations ».
- **Existant**, icônes : Lucide (coche, cadenas, bouclier, horloge, crayon), toujours en `aria-hidden`.

