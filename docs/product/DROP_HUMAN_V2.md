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
