# Architecture du dépôt

Ce document dit où vit chaque morceau de drop et d'où vient chaque build. Il décrit, il ne fixe rien : le contrat reste dans `openspec/specs/`, la vision et le flux dans [openspec/project/architecture.md](../openspec/project/architecture.md).

## L'app de bureau en trois couches

L'app de bureau est la même sur macOS, Windows et Linux. Elle a trois couches.

1. **Tauri est la coque native** (`apps/desktop`). Elle gère la fenêtre, l'icône de barre de menus ou de zone de notification, le démarrage automatique, l'installeur, les mises à jour et les liens profonds `drop://`. Elle ne porte aucune logique métier.
2. **Le Node local est le moteur** (`packages/node`). Tauri le démarre et l'arrête. Il écoute sur `127.0.0.1`, garde l'identité et les clés, parle au relais et sert l'interface.
3. **React et shadcn/ui forment l'interface** (`packages/desktop-ui`). Elle est compilée hors ligne, embarquée dans le Node et affichée dans une fenêtre de Tauri.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="diagrams/architecture-overview-dark.svg">
  <img src="diagrams/architecture-overview.svg" alt="Schéma de l'architecture sur un poste : l'app de bureau Tauri affiche l'espace de travail React servi par le Node local ; les agents de code se branchent au Node par MCP ; les capacités ne s'exécutent qu'après consentement et appellent les outils du propriétaire ; les Nodes joignent un collègue par un lien chiffré : un relais, iroh ou le réseau local." width="960">
</picture>

## Qui fait quoi

| Chemin                      | Rôle                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/desktop`              | Coque Tauri 2 en Rust (`src-tauri/src/main.rs`). Icône de barre de menus, fenêtres `panel` et `workspace`, lien profond `drop://`, démarrage automatique, mise à jour signée en option. Elle lance le Node embarqué, attend qu'il réponde, puis affiche ce qu'il sert. La page de démarrage `web/index.html` montre les états et codes avant que le Node soit prêt. |
| `packages/desktop-ui`       | Interface React 19 avec des composants shadcn/ui (Radix) et Tailwind 4. Écrans : vue d'ensemble, agents, partage, équipe, réseau, faits. `node scripts/build-desktop-ui.ts` la compile avec esbuild et Tailwind, puis l'écrit compressée dans `packages/node/src/workspace-assets.generated.ts`. Aucune ressource externe : pas de CDN, pas de police distante, pas d'IPC Tauri. |
| `packages/node`             | Le moteur. Identité, CLI, orchestration, API locale authentifiée sur `127.0.0.1`, détection et installation dans les agents. Il sert `/app` (panneau) et `/workspace` (interface React) avec une CSP stricte : le script est autorisé par son empreinte SHA-256, `connect-src 'self'`, rien d'autre.                                                     |
| `packages/relay`            | Relais WebSocket : routage et admission des Nodes. Les demandes y passent signées et chiffrées.                                                                                                                                                                                                                                                                |
| `packages/protocol`         | Schémas zod des messages, identité, signature Ed25519, chiffrement, reçus.                                                                                                                                                                                                                                                                            |
| `packages/capabilities`     | Capacités déterministes, dépôt de code, MCP et A2A. Chaque capacité fixe ses outils avant l'appel au modèle.                                                                                                                                                                                                                                           |
| `packages/runner`           | Pipeline d'exécution d'une demande : budgets, appel au modèle, validation de sortie, scanner de secrets. Il n'écoute aucun port.                                                                                                                                                                                                                      |
| `packages/requester-mcp`    | Serveur MCP stdio que l'agent local lance. Il parle à l'API du Node, jamais directement au relais.                                                                                                                                                                                                                                                    |
| `packages/a2a`              | Adaptation A2A entrante vers le même consentement.                                                                                                                                                                                                                                                                                                    |
| `crates/drop-iroh`          | Programme Rust pour le chemin Internet par iroh. Le Node le pilote par stdin et stdout. L'app de bureau l'embarque.                                                                                                                                                                                                                                  |
| `packages/blocked-observer` | Mesure locale du besoin : un agent signale qu'il est bloqué par une ressource d'un autre.                                                                                                                                                                                                                                                             |
| `packages/simulation`       | Banc local avec des Nodes simulés.                                                                                                                                                                                                                                                                                                                    |
| `packages/gateway`          | Passerelle distante pour Claude et ChatGPT en ligne. Option cloud reportée, désactivée dans le profil privé.                                                                                                                                                                                                                                           |

## D'où vient chaque build

| Cible                         | Source                                                                                                                                                                                                                       |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App macOS (`.app`, `.dmg`)    | `node scripts/build-mac.ts` sur un Mac. Le script assemble le Node, `drop-iroh` et les bundles dans `apps/desktop/src-tauri/resources/`, puis lance `tauri build`. Signature, notarisation et mises à jour : [MAC_RELEASE](MAC_RELEASE.md). |
| App Windows et Linux          | Même coque `apps/desktop`. Les scripts de build et d'installeur de ces plateformes restent à écrire ; la CI exécute déjà la suite de tests sur Linux, Windows et macOS (`.github/workflows/test.yml`).                              |
| Interface de bureau           | `node scripts/build-desktop-ui.ts`, résultat commité dans `packages/node`. La CI vérifie avec `--check` que le fichier commité correspond aux sources.                                                                     |
| Image Docker (relais, Node, passerelle, site) | `Dockerfile` à la racine, construit et publié sur `ghcr.io` par `.github/workflows/build.yml`.                                                                                                              |
| Relais sur Kubernetes         | Chart Helm dans `deploy/helm`.                                                                                                                                                                                              |

## Garder la structure lisible

- Une app native par dossier sous `apps/`. Il n'y en a qu'une : `apps/desktop` sert toutes les plateformes.
- Un package par responsabilité sous `packages/`. L'interface ne contient aucune logique de sécurité : le Node décide, l'interface montre.
- Le code Rust propre à une plateforme reste dans `apps/desktop/src-tauri` derrière `#[cfg(target_os = ...)]`, pas dans un autre dossier d'app.
- Le nom produit `drop` et l'identifiant `dev.memolabs.drop` de `tauri.conf.json` ne changent pas : ils portent la signature notarisée et le canal de mise à jour.
