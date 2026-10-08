# drop

Un agent pose une question bornée à la capacité d'un autre propriétaire ; le propriétaire autorise une fois ; seul un
résultat typé et filtré revient. Nom de code `drop` ; le nom produit reste à trouver (voir `docs/DECISIONS.md`).

Développé en spec-driven avec [OpenSpec](https://github.com/Fission-AI/OpenSpec), une tâche par session, réalisable
par Claude Code ou Codex.

## Contenu

| Chemin | Rôle |
| --- | --- |
| `AGENTS.md` | Règles pour tous les agents : cycle de travail, stack, sécurité. Lu automatiquement par Codex. |
| `CLAUDE.md` | Importe `AGENTS.md` pour Claude Code. |
| `openspec/project/` | Vision et architecture (descriptif). |
| `openspec/specs/` | Le contrat : une capacité par dossier, exigences et scénarios. |
| `openspec/changes/` | Une change par tâche ; `archive/` garde les changes livrées. |
| `docs/TASKS.md` | Index des tâches : ordre, dépendances, statut. |
| `docs/DECISIONS.md` | Décisions de cadrage et journal. |

Le kit de specs en prose d'origine (`docs/specs/`) est dans le commit `ecf96a8`.

## Essayer en local (5 minutes)

```bash
pnpm install
scripts/demo-local.sh
```

Le script lance un relais, un Node « VPS » qui publie `production.error_summary` sur un log de démonstration, et un
Node « Guillaume » qui demande via le serveur MCP puis autorise une fois. Tout tourne sur `127.0.0.1`, dans un dossier
temporaire. Il montre le refus local d'une entrée invalide, le résultat filtré, les reçus signés, et vérifie qu'aucun
fragment de log n'a fui.

Commandes : `node packages/node/src/cli.ts help` (binaire `drop`), `node packages/relay/src/cli.ts` (`drop-relay`).
Brancher Claude Code ou Codex : `packages/requester-mcp/README.md`.

## Travailler

Prérequis : Node 22+, pnpm, `npm i -g @fission-ai/openspec@latest`.

À chaque session, dans Claude Code ou Codex :

> Lis AGENTS.md, puis prends la prochaine tâche `todo` de docs/TASKS.md dont les dépendances sont faites.

L'agent suit le cycle d'AGENTS.md : lire la spec, lever les doutes (`grilling`), `/opsx:propose`, accord humain,
`/opsx:apply`, contrôles (lint, typecheck, test, `openspec-guard`, `/review`, `/cso`), `/opsx:archive`.

Pour cibler une tâche précise : « Réalise T1.3. »

## Ordre conseillé

1. T0.0 → T0.5, puis installer `blocked-observer` chez toi et chez les testeurs.
2. Écrire le seuil go/no-go dans `docs/DECISIONS.md`.
3. T1.1 → T1.14 pendant la mesure ; le pilote n'a lieu que si le seuil est franchi.

## Commandes utiles

```bash
openspec list --specs
openspec show <capacité> --type spec
openspec validate --all --strict
pnpm -r lint && pnpm -r typecheck && pnpm -r test
```
