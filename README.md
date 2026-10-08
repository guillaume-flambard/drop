# drop — kit de specs

Specs prêtes à être réalisées par Claude Code ou Codex, une tâche par session.
Nom de code `drop` ; le nom produit reste à trouver (voir `docs/DECISIONS.md`).

## Contenu

| Fichier | Rôle |
| --- | --- |
| `AGENTS.md` | Règles pour tous les agents : workflow, stack, sécurité. Lu automatiquement par Codex. |
| `CLAUDE.md` | Importe `AGENTS.md` pour Claude Code. |
| `docs/specs/00-vision.md` | Le produit, les principes, ce qu'on ne construit pas. |
| `docs/specs/01-architecture.md` | Composants, monorepo, modèle de données, séquence. |
| `docs/specs/02-step0-blocked-observer.md` | Étape 0 : mesurer les blocages. |
| `docs/specs/03` à `07` | Protocole, relais, Node et consentement, runner et capacités, MCP demandeur. |
| `docs/specs/08-deploy-mac-vps.md` | Déploiement de test et scénario de démo. |
| `docs/TASKS.md` | Les tâches ordonnées, avec dépendances et statut. |
| `docs/DECISIONS.md` | Décisions de cadrage et journal. |

## Démarrer

```bash
mkdir drop && cd drop && git init
# copier le contenu de ce kit ici
git add . && git commit -m "Specs initiales"
```

Puis, à chaque session, dans Claude Code ou Codex :

> Lis AGENTS.md, puis prends la prochaine tâche `todo` de docs/TASKS.md dont les dépendances sont faites.
> Fais un plan court, attends mon accord, puis réalise-la jusqu'aux critères d'acceptation.

Pour cibler une tâche précise : « Réalise T1.3. »

## Ordre conseillé

1. T0.0 → T0.5, puis installer `blocked-observer` chez toi et chez les testeurs.
2. Écrire le seuil go/no-go dans `docs/DECISIONS.md`.
3. T1.1 → T1.14 pendant la mesure ; le pilote n'a lieu que si le seuil est franchi.

## Points que l'agent doit vérifier au moment de coder

Les specs les signalent par « à vérifier » : le format exact de l'entrée des hooks Claude Code, l'emplacement des logs
de session Codex, et les noms exacts des options du Claude Agent SDK (outils autorisés, chargement des réglages).
Ces interfaces évoluent : l'agent consulte la doc à jour avant d'implémenter et note ce qu'il a trouvé dans
`docs/DECISIONS.md`.
