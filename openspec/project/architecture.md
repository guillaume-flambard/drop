# Architecture

Conception adoptée le 9 octobre 2026. Les specs des capacités décrivent les contrats du prototype ; [ACCEPTANCE](../../docs/ACCEPTANCE.md) définit les critères futurs à promouvoir dans ces specs pendant T3.*. Ce document ne prouve pas leur implémentation.

## Infrastructure choisie par le client

```text
Poste A                                  Poste B / service interne
Agent compatible                         App de consentement
  │ MCP stdio                              │ décision du propriétaire
requester-mcp → API locale → Node A       Node B → runner → capacité
                              │            │                 │
                              └─ relais ───┘         source / modèle autorisé
                                 interne
                 enveloppes chiffrées entre les Nodes

Agent d’entreprise A2A ↔ interface A2A du Node
Capacité a2a.answer → agent A2A approuvé dans le périmètre du client
```

Le relais relie les postes sans exposer de port entrant sur chaque runner. Il peut vivre sur un poste pour une démonstration, un serveur interne ou un environnement privé du client. Une recette conteneur sans Internet est vérifiée dans T3.1 ; Kubernetes n’est pas requis. La découverte LAN et le pair-à-pair direct ne sont pas des prérequis.

Un laptop peut héberger le relais de test et plusieurs Nodes. Une équipe répartie nécessite une connectivité vers son relais (réseau ou VPN choisi par elle). « Hors ligne » signifie Internet bloqué avec connectivité interne disponible, modèles et dépendances présents. On ne peut pas joindre un collègue devenu injoignable.

## Frontières de données

| Surface                 | Ce qu’elle voit                                       | Contrôle cible                                                                                  |
| ----------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Relais                  | Identités, routage, horodatages, enveloppes chiffrées | Hébergement client, admission, expiration selon la spec `relay`                                 |
| Node et runner          | Question, sources choisies, résultat                  | Capacité publiée, consentement, outils figés, snapshot en allowlist, validation et scanner      |
| Modèle                  | Contexte transmis par la capacité                     | Endpoint du propriétaire, jamais remplacé par le financement                                    |
| MCP ou A2A joint        | Paramètres et données demandés                        | Adresse et outils choisis ; politique réseau ; vérifier sa propre configuration                 |
| Demandeur               | Résultat autorisé                                     | Schéma, contrôles de sortie, relecture lorsque requise ; contenu traité comme donnée non fiable |
| Passerelle grand public | Questions et réponses en clair                        | Hors profil privé, activation explicite                                                         |
| Logs et reçus           | Codes, hash et métadonnées                            | Pas de contenu ni secret, diagnostic local expurgé et export volontaire                         |

Le chiffrement ne limite pas ce qu’un outil lit. Le scanner ne détecte pas toutes les informations confidentielles. Les règles de sortie, l’isolation des sources, l’autorisation et le contrôle réseau se complètent. drop n’est pas une sandbox universelle pour les outils d’un agent A2A externe : cet agent conserve sa propre frontière de confiance.

Le profil privé cible refuse les destinations hors politique, y compris via redirection ou résolution. Aucun fallback distant. Télémétrie désactivée, activation de licence en ligne non requise, mise à jour et téléchargement séparés de l’usage courant. Installation de paquets vérifiés possible par un canal interne ou hors ligne.

## Application et adaptateurs

Tauri 2 conserve le shell de barre de menus, le panneau web local et le cœur Node embarqué. L’icône et les menus utilisent les primitives du système ; le panneau n’est pas une interface SwiftUI. Le WebView système évite d’ajouter Chromium au paquet, sans gain de mémoire chiffré non mesuré. Node reste à distribuer et maintenir.

Electron imposerait une migration sans bénéfice établi ici. SwiftUI donnerait une intégration Mac plus poussée au prix d’autres interfaces pour Windows et Linux. Voir [les sources et compromis](../../docs/research/2026-10-09-desktop-models.md), D35.

Adaptateurs initiaux : Claude Code, Codex, Cursor, Claude Desktop. Chaque adaptateur décrit chemins, format, installation et versions compatibles. L’inventaire ne lance aucun exécutable découvert. Les nouveaux agents s’ajoutent par adaptateur ; un agent A2A interne se raccorde via son URL approuvée et son authentification.

## Cycle d’une demande

1. `ask_team` ou une capacité précise est appelée via MCP ; A2A rejoint le même consentement.
2. Le Node valide schémas et destinataires. Le routage `ask_team` reste déterministe et borné.
3. La demande signée et chiffrée traverse le relais ; l’approbateur accepte, refuse ou reporte.
4. Le runner utilise uniquement les outils et budgets de la capacité.
5. Une sortie invalide ou un secret détecté entraîne un rejet, sans réparation par le LLM. Les sorties sensibles passent par relecture.
6. Le résultat autorisé revient ; les reçus gardent hash et métadonnées. Expiration, refus et indisponibilité restent visibles.

## Modules actuels

| Module                      | Responsabilité                                                                 |
| --------------------------- | ------------------------------------------------------------------------------ |
| `packages/blocked-observer` | Mesure locale du besoin                                                        |
| `packages/protocol`         | Schémas zod, identité, signature, chiffrement, reçus                           |
| `packages/relay`            | Routage WebSocket et admission                                                 |
| `packages/node`             | Identité, CLI, orchestration, API et panneau locaux, détection et installation |
| `packages/runner`           | Pipeline, budgets et contrôles                                                 |
| `packages/capabilities`     | Capacités déterministes, dépôt, MCP et A2A                                     |
| `packages/requester-mcp`    | Connecteur MCP stdio vers l’API locale                                         |
| `packages/a2a`              | Adaptation A2A entrante                                                        |
| `packages/gateway`          | Connecteur distant grand public facultatif                                     |
| `apps/mac`                  | Shell Tauri                                                                    |
| `site`, `scripts/site.ts`   | Présentation statique et export explicite de documents                         |

Le runner n’écoute aucun port. L’API du Node écoute localement et reste authentifiée. Les clés privées restent dans `~/.drop/` avec droits `0600`. `requester-mcp` parle à cette API, jamais directement au relais.

## Écart avec le prototype au début de T3.0

T3.1 remplace le bootstrap Mac public par un relais loopback ou explicitement configuré. Le runtime privé propose Ollama local et exige un modèle explicite ; le financement ne remplace plus sa destination. Les transports privés autorisent des IP privées littérales exactes, sans DNS, redirection ni proxy implicite. Les sources MCP stdio non isolées sont refusées. Voir [PRIVATE_PROFILE](../../docs/PRIVATE_PROFILE.md). Les installeurs raccordent individuellement les agents ; la transaction groupée avec restauration reste à construire. A2A entrant et sortant existent, sans démontrer la conformité à tout A2A ni la souveraineté de bout en bout.

T3.1 prouve le cycle privé dans un conteneur sans Internet, avec deux Nodes et des fixtures MCP/modèle ; cela ne qualifie pas un vrai modèle ni tous les agents tiers. T3.2 qualifie les modèles. T3.3 réalise le raccordement. T3.4 termine l’app distribuable. T3.5 apporte les preuves d’ensemble. Ordre et reprise des anciens chantiers : [TASKS](../../docs/TASKS.md).

## Composants de l'étape 2 réunis (D76)

La branche principale a ajouté, avant la réunion du 10 octobre 2026, des composants que ce document garde hors du profil privé :

- **Passerelle** (`packages/gateway`, T2.13, D31, D71) : rend drop joignable depuis Claude et ChatGPT en ligne par OAuth et MCP distant ; la liaison se confirme dans l'app ; elle voit questions et réponses en clair. Désactivée dans le profil privé.
- **Relais** : en plus de la révocation inscrite dans sa config (T3.1), un fichier de révocations relu à chaud, avec propagation aux nœuds admis par un nœud révoqué, et un plafond global d'admissions par jour (T2.19, D75).
- **mcp.answer** : connexion OAuth de drop à des serveurs MCP distants, jetons sous `DROP_HOME/oauth` (T2.17, D74), et partage vérifié qui explique pourquoi un serveur est inutilisable (T2.16, D73). Le profil privé n'utilise ni l'un ni l'autre : ses sources passent par sa politique de destinations.
- **App Mac** : mise à jour signée proposée dans le menu, seulement dans un build fait avec la clé de mise à jour (T2.4, D70, D76).
- **Site** : pages publiques et fichiers de mise à jour servis par l'image drop (T2.6, D72).
- `requester-mcp` sépare sa bibliothèque (`src/lib.ts`) de son point d'entrée (`src/index.ts`) pour qu'un fichier assemblé ne démarre jamais le serveur (T2.18).
