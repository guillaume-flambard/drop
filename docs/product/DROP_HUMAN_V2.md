# Drop Human V2 — première intégration réelle

**Branche :** `feat/drop-v2-human-ui` · **Statut :** proposition de design, intégration progressive dans le panneau réel.

La source d'autorité reste `docs/product/PRD.md`, `docs/product/APP_FLOW.md` et les spécifications OpenSpec. Cette branche applique la direction « Human 2026 » sans modifier les contrats de consentement ni le protocole réseau.

## Ce qui est intégré

1. **Thème du panneau :** `packages/node/src/panel-human.ts`, injecté par `packages/node/src/panel.ts` dans la page `/app` servie localement. Aucune ressource externe, police ou dépendance UI. Modes clair/sombre, clavier et préférences de mouvement préservés.
2. **Démarrage cohérent :** mêmes tokens de base dans `apps/mac/web/index.html` pour les états avant disponibilité du moteur.
3. **Demandes :** libellé humain, carte de consentement plus lisible, actions explicites et registre « recevra / ne recevra jamais » maintenu avant les boutons.
4. **Relecture :** contenu et retrait champ par champ toujours présents ; seule la présentation et la formulation de l'étape changent.
5. **Mes questions :** liste de suivi consultable au clavier (élément HTML natif `details`/`summary`) avec une explication courte de l'état réel fourni par `GET /ui/outbound`. L'ouverture d'un détail résiste aux mises à jour du panneau.

## Ce qui ne change pas

- La confirmation `allow_once`, `deny` ou `not_now` va toujours vers `POST /ui/decide`.
- La relecture `send` ou `discard` et les champs `redact` vont toujours vers `POST /ui/review`.
- Répondre manuellement requiert toujours rédaction, relecture et action d'envoi.
- Les contenus externes restent insérés via `textContent`. Aucun HTML produit par un pair n'est interprété.
- Aucun outil, agent, relais Internet ou accès n'est activé implicitement.
- Les faits déjà publiés continuent de suivre leurs propres durées et audiences.

## Les limites du suivi

`/ui/outbound` expose `dropId`, `ownerName`, `title`, `state` et éventuellement `result` ou `error`. Il **n'expose pas** une chronologie d'événements horodatés. La V2 montre donc uniquement l'état présent, expliqué en français. Elle n'invente ni pourcentage, ni trajet réseau, ni heure d'acceptation.

Une chronologie exacte nécessitera un contrat de lecture séparé et des événements persistés côté Node avant d'être proposée à l'écran.

## Jetons du premier lot

| Jeton | Clair | Sombre | Usage |
| --- | --- | --- | --- |
| `--ground` | `#FBFAF8` | `#24232A` | Fond |
| `--card` | `#FFFEFD` | `#2C2A32` | Cartes |
| `--ink` | `#292732` | `#F5F0F3` | Texte |
| `--soft` | `#5E5965` | `#D7CFD7` | Texte secondaire |
| `--accent` | `#5656A9` | `#B9B1FA` | Autorisation et focus |
| `--ok` | `#397E69` | `#8DC5AE` | Confirmation |
| `--warn` | `#A25259` | `#EFA5A9` | Erreur ou refus |

Les autres couleurs se trouvent dans `panel-human.ts`. Le code suit pour l'instant la spécification historique D46 via une branche de proposition ; une révision explicite de D46 et de `docs/product/UX_UI.md` sera nécessaire avant une fusion définitive.

## Lot suivant, sans dette UX cachée

1. Décomposer la page « Mes outils » : assistants, sources partagées, faits publiés et réseau.
2. Ouvrir les réglages avancés dans une **seconde fenêtre Tauri**, avec adaptation Windows/Linux prévue dès le design.
3. Instrumenter l'historique fiable des demandes si les essais justifient une chronologie détaillée.
4. Recette manuelle sur Mac à 380×620 : zone de consentement, petite hauteur d'écran, très longues questions, VoiceOver, modes contraste et transparence réduite.
5. Valider le nouveau design avec les mêmes personnes non techniques qui doivent comprendre ce qu'elles autorisent.

## Vérifications

Avec Node >=22.18 et pnpm 11.27 :

```sh
pnpm install --frozen-lockfile
pnpm -r lint
pnpm -r typecheck
pnpm -r test
node scripts/build-mac.ts --debug
```

Les tests automatisés ne remplacent pas une validation du WebView Tauri réel et de VoiceOver.

## Récupérer la branche sur Mac (sans écraser de modifications locales)

Dans **ton clone local existant** :

```sh
git status --short
git fetch origin
git switch --track origin/feat/drop-v2-human-ui
```

Si `git status` révèle du travail non commité, le préserver dans un commit ou un worktree distinct avant le changement de branche. Ne pas utiliser de `reset --hard`, de `clean` ni de push forcé.

Windows et Linux sont des cibles de design, pas des builds livrés par cette branche.

## Itération 2 — véritable fenêtre de gestion (branche en cours de revue)

Le petit panneau 380 × 620 conserve les décisions rapides. Une **seconde fenêtre native Tauri** s'ouvre depuis le menu de l'icône, via « Ouvrir mon espace… ». Dimensions initiales : 980 × 720, fenêtre redimensionnable, minimale 720 × 560. Aucun élargissement automatique du popover et aucun accès Tauri IPC ajouté à l'origine locale distante.

La page `GET /workspace` est servie par le même Node, protégée par le **même jeton local**. Sa CSP propre autorise un script à hash SHA-256 exact et les styles requis par Radix ; l'absence de ressources externes reste obligatoire. La fenêtre lit et modifie uniquement les mêmes API déjà définies dans `packages/node/src/api.ts` :

- **Vue d'ensemble** : équipe, nombre d'outils partagés, derniers échanges, sans progression inventée.
- **Équipe** : personnes, disponibilités, capacités, création d'une équipe et invitation en un geste explicite.
- **Assistants** : détection locale et raccordement en deux confirmations ; les configurations manuelles restent affichées comme texte.
- **Outils partagés** : aucun partage implicite ; une confirmation séparée précède l'appel au backend.
- **Faits publiés** : création, modification et retrait ; l'exception au consentement question-par-question est montrée *avant* publication.
- **Connexion** : réseau local et paramètres Internet existants ; aucun relais activé sans action explicite.

La page n'ajoute aucun index central, accès permanent, service tiers ni police distante. Depuis l'itération 3, elle utilise des dépendances UI compilées et embarquées localement, détaillées dans D87.

### Captures de cette itération

Les images ci-dessous sont des **captures Chromium du vrai HTML rendu depuis les fichiers source de la branche** et alimenté par une **API simulée uniquement pour la démonstration**. Elles ne prouvent ni la compilation Tauri sur Mac ni la qualité d'un WebView système réel :

- [Panneau : consentement 380 × 620](screenshots/12-panel-request.png)
- [Panneau : relecture avant envoi](screenshots/14-panel-review.png)
- [Fenêtre : vue d'ensemble](screenshots/01-overview.png)
- [Fenêtre : équipe](screenshots/02-team.png)
- [Fenêtre : assistants après analyse](screenshots/04-assistants-analysis.png)
- [Fenêtre : confirmation de partage](screenshots/06-sharing-confirm.png)
- [Fenêtre : faits publiés](screenshots/07-facts.png)
- [Fenêtre : choix du relais](screenshots/09-network-relay.png)
- [Fenêtre : apparence sombre](screenshots/10-overview-dark.png)

Le test de rendu confirme l'absence d'erreur JavaScript dans ces scénarios, et vérifie qu'aucun `POST /ui/admin/share` n'est envoyé avant la confirmation. Sur la demande fictive de la capture, le bouton « Autoriser une fois » se termine à `y=572px` dans une fenêtre de `620px` ; cela ne garantit pas le même résultat pour toutes les longueurs de questions.

### Non encore vérifié

- Compilation Rust et affichage dans un vrai WebView macOS ; recette sur Mac et VoiceOver.
- Builds natifs Windows et Linux. La nouvelle surface HTML est responsive mais les autres plateformes ne sont pas encore livrées.
- Chronologie persistante : `/ui/outbound` n'expose toujours que l'état courant. Une ligne de temps réelle reste un chantier backend indépendant.
- Finalisation du partage par modèle et de l'administration d'entreprise (T4.16), sans l'inventer dans les écrans.

La fusion reste conditionnée aux validations de sécurité, à la mise à jour explicite de D46 et à une recette humaine sur l'app Mac.


## Itération 3 — bibliothèque de composants populaire (demande utilisateur)

Cette version remplace les 600 lignes d'interface de gestion générée à la main par une **application React 19** utilisant des **primitives Radix UI**, des composants locaux inspirés de **shadcn/ui**, **Tailwind CSS v4**, **Lucide**, **CVA**, **clsx** et **tailwind-merge**. Il s'agit bien de composants React/Radix réels, pas d'une illustration visuelle.

Code du frontend : `packages/desktop-ui/src/`, notamment `App.tsx`, `components/ui/` et `views/`. Les six vues (accueil, équipe, assistants, partages, faits et réseau) restent connectées aux API du Node. La partie décision/consentement du petit panneau `/app` demeure la source d'autorité de ces actions.

### Construction locale et sécurité

- `node scripts/build-desktop-ui.ts` produit le module `packages/node/src/workspace-assets.generated.ts` (ressources JS/CSS compilées, compressées et incluses **dans le repository et dans le bundle Node**).
- `node scripts/bundle.ts` reconstruit les ressources avant de produire le `drop.mjs` autonome. Aucun CDN, aucune police externe, aucun serveur supplémentaire ne sont utilisés à l'exécution.
- `GET /workspace` exige l'authentification locale et l'en-tête de sécurité. Le JavaScript n'est permis que par **hash SHA-256** ; les styles inline nécessaires à Radix sont autorisés. Aucune permission Tauri IPC n'est accordée à la fenêtre externe.
- Toute opération de partage, invitation, publication ou déconnexion reste sous contrôle humain avec une confirmation avant les appels `POST` sensibles.
- Les données de collègues sont affichées comme texte par React, jamais injectées sous forme de HTML distant.
- Le thème suit le système, les composants sont accessibles au clavier et la préférence `prefers-reduced-motion` est respectée. La validation VoiceOver macOS reste ouverte.

### Captures de cette itération

Toutes proviennent de Chromium exécutant **le code compilé** alimenté par des réponses API fictives, pas de l'application native en fonctionnement réel. Les captures suivent le préfixe `screenshots/react-shadcn/` :

- [Accueil](screenshots/react-shadcn/01-accueil.png)
- [Équipe](screenshots/react-shadcn/02-equipe.png)
- [Invitation dans une fenêtre Radix](screenshots/react-shadcn/03-invitation.png)
- [Assistants](screenshots/react-shadcn/04-assistants.png)
- [Analyse et sélection](screenshots/react-shadcn/05-analyse.png)
- [Partages](screenshots/react-shadcn/06-partages.png)
- [Confirmation d'un partage](screenshots/react-shadcn/07-confirmation-partage.png)
- [Faits publiés](screenshots/react-shadcn/08-faits.png)
- [Publication d'un fait](screenshots/react-shadcn/09-publier-fait.png)
- [Réseau](screenshots/react-shadcn/10-reseau.png)
- [Relais privé](screenshots/react-shadcn/11-reseau-relais.png)
- [Mode sombre](screenshots/react-shadcn/12-accueil-sombre.png)
- [Petite fenêtre](screenshots/react-shadcn/13-compact.png)

L'expérience visualisée ici ne garantit pas le comportement natif Tauri avant une recette sur Mac. Pour ne pas risquer de régression, aucun réglage n'est automatiquement publié ni synchronisé à une autre machine.

**Limites** : Windows et Linux ne sont pas encore distribués ; la chronologie détaillée du suivi n'existe pas dans l'API ; l'app native et VoiceOver restent à valider.
