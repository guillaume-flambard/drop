# Comprendre drop

**Obtenir la réponse. Garder la maîtrise de ses accès.**

Votre agent a besoin d'une information détenue par un collègue. Avec drop, il lui adresse une demande précise. Le collègue choisit de l'autoriser ; son environnement exécute une action définie à l'avance ; votre agent reçoit la réponse autorisée.

`drop` est un nom de code. Cap adopté le 9 octobre 2026 : collaboration A2A/MCP dans l'infrastructure du client, app Mac de barre de menus, socle Community sous Apache-2.0. Le prototype existe ; le profil privé complet et le raccordement groupé restent à construire. Le [bilan daté](AVANCEMENT.md) précise les preuves.

## La cible privée

Un relais interne relie les postes ; aucun serveur Memo Labs ni compte externe ne doit être requis. Le modèle peut être sur le laptop ou dans l'entreprise. Les destinations des modèles, connecteurs et agents joints doivent être approuvées : avoir l'app sur son Mac ne rend pas une API cloud locale.

L'app conserve Tauri 2 et le moteur partagé. Mac d'abord, Windows puis Linux. Après installation et environnement prêt : analyser les configurations compatibles, puis raccorder les agents sélectionnés. Ce parcours de deux confirmations ne publie aucun outil. Invitations, permissions système et téléchargements sont séparés. Voir [ONBOARDING](ONBOARDING.md).

Le modèle existant passe en premier. Sans modèle, les capacités déterministes fonctionnent ; Ollama avec Qwen3.5 4B/9B est une option à mesurer, avec téléchargement volontaire et aucun fallback distant dans le profil privé cible. Voir [MODELS](MODELS.md).

La sécurité essentielle et l'auto-hébergement sont gratuits. L'installation, l'intégration et le support peuvent financer le projet ; l'administration d'organisation est une piste future. [OPEN_SOURCE](OPEN_SOURCE.md) fixe la frontière et les étapes avant publication.

## Une question, un accord, une réponse

Guillaume veut savoir si le dépôt de Julie gère le mode sombre. Il n'a pas besoin d'obtenir tout le dépôt pour prendre sa décision.

![Une demande précise arrive chez Julie ; elle autorise, son environnement prépare la réponse, elle la relit puis Guillaume la reçoit](diagrams/journey.svg)

1. **Demander.** L'agent choisit une capacité disponible et pose une question, accompagnée d'une raison lisible.
2. **Autoriser.** Julie voit qui demande, pourquoi, ce qui pourra être renvoyé et le coût annoncé. Elle peut accepter une fois, refuser ou répondre « pas maintenant ».
3. **Exécuter chez le propriétaire.** La capacité utilise seulement les outils prévus. Pour un dépôt, elle travaille dans une copie temporaire des fichiers autorisés.
4. **Relire si la capacité est sensible.** Julie voit la réponse de `repo.answer` ou de `mcp.answer` avant son envoi. Elle peut retirer des champs ou abandonner l'envoi.
5. **Recevoir.** L'agent de Guillaume obtient une réponse structurée. Un reçu signé conserve des empreintes et des métadonnées, sans recopier la question ni la réponse.

Un refus arrête cette demande. « Pas maintenant » ne planifie pas une relance automatique. Sans accord avant l'expiration, la capacité ne s'exécute pas. Un résultat invalide ou détecté comme secret par les contrôles de sortie n'est pas envoyé.

## Ce que drop sait faire aujourd'hui

| Capacité                   | Exemple de question                            | Résultat prévu                                          | Relecture                                          |
| -------------------------- | ---------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------- |
| `production.error_summary` | « La production va bien depuis une heure ? »   | État, compteurs et catégories d'erreurs                 | Pas de seconde relecture ; traitement déterministe |
| `repo.answer`              | « Le mode sombre est-il déjà implémenté ? »    | Réponse courte, verdict et noms de fichiers             | Oui                                                |
| `a2a.answer.<nom>`         | « Que sait cet agent interne sur le projet ? » | Réponse d’un agent A2A approuvé, bornée par la capacité | Oui                                                |
| `mcp.answer.<nom>`         | « Cette maquette prévoit-elle un état vide ? » | Réponse courte, verdict et noms de sources              | Oui                                                |

Toutes ces capacités demandent une autorisation initiale. Les capacités dépôt et MCP utilisent un modèle ; un agent A2A joint utilise sa propre implémentation. Le résumé d'erreurs ne nécessite pas de modèle.

Une capacité est un **contrat d'action** : une entrée, une sortie, des outils autorisés, une sensibilité et un budget. Le demandeur choisit dans ce catalogue ; il ne transmet pas une liste de nouveaux outils à exécuter.

`mcp.answer` est un adaptateur générique. Figma, Notion, Linear ou GitHub sont des usages possibles lorsqu'un serveur MCP approprié est déjà configuré chez le propriétaire. Ce ne sont pas des intégrations toutes validées chez des clients.

## Comment les pièces s'assemblent

![L'agent demandeur passe par son connecteur MCP et son Node, puis par un relais chiffré vers le Node du propriétaire ; le propriétaire contrôle le runner et les sources](diagrams/architecture.svg)

| Pièce           | Son rôle                                                                         |
| --------------- | -------------------------------------------------------------------------------- |
| Agent demandeur | Claude Code, Codex ou un autre client capable d'utiliser le serveur MCP          |
| `requester-mcp` | Traduit les outils de l'agent en appels à l'API locale du Node                   |
| Node            | Processus local qui porte l'identité, gère les demandes et se connecte au relais |
| Relais          | Route les enveloppes chiffrées entre les Nodes, même à distance                  |
| Approbateur     | Personne qui décide ; son Node peut différer de celui qui exécute                |
| Runner          | Exécute la capacité et contrôle la sortie                                        |
| Reçu            | Trace signée avec empreintes, décision, outils et horodatages                    |

Exemple : le VPS peut résumer ses propres logs pendant que Guillaume autorise la demande sur son Mac. Les connexions au relais partent des Nodes. L'interface de consentement et l'API du Node écoutent sur la boucle locale ; le runner n'expose pas de port.

### Les outils de l'agent

```text
ask_team             Poser une question à l’équipe, routage déterministe borné
list_capabilities    Découvrir les réponses disponibles chez ses pairs
request_drop         Envoyer une demande pour une capacité
get_drop_result      Attendre ou récupérer le résultat
```

`request_drop` reçoit `capability_id`, `input` et `purpose`. L'entrée est validée localement avant envoi. Le résultat d'un pair est encadré comme une donnée non fiable, pas comme une instruction à suivre.

## Ce qui circule et ce qui reste chez soi

La distinction essentielle est **qui reçoit quoi**.

| Destinataire                            | Ce qu'il peut recevoir                                                                                |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Demandeur                               | Sortie conforme au contrat et autorisée ; aucun accès permanent au dépôt ou à l'outil du propriétaire |
| Relais                                  | Enveloppes chiffrées et métadonnées de routage ; pas le contenu déchiffré                             |
| Propriétaire / exécuteur                | Question et raison de la demande ; accès à ses propres sources                                        |
| Fournisseur du modèle, s'il est distant | Question et contexte transmis au modèle, notamment les résultats des outils qu'il utilise             |

**Exécution locale ne signifie pas modèle local.** Le fournisseur configuré par défaut dans le code est OpenRouter. Avec un fournisseur distant, des extraits du dépôt ou des résultats MCP peuvent lui être transmis pendant le raisonnement. Un modèle local compatible peut être configuré, mais il faut vérifier sa capacité à utiliser les outils et la qualité de ses réponses.

Le chiffrement protège le transport entre Nodes. Les listes d'outils, schémas, budgets, filtres et relectures limitent ce qui est exécuté et renvoyé. Ils ne constituent ni un audit de sécurité indépendant, ni un bac à sable système, ni une garantie absolue contre la divulgation. Les annotations de lecture seule d'un serveur MCP ne remplacent pas l'examen des outils que l'on choisit de partager.

## Qui paie le modèle ?

**Comportement historique à encadrer dans T3.1.** Le profil privé cible fixe le modèle et sa destination chez le propriétaire : une clé de financement ne doit pas les remplacer. Ce contrôle n'est pas encore livré.

Le financement par le demandeur est implémenté : une clé plafonnée est créée pour la demande et transmise chiffrée à l'exécuteur. Elle n'est pas écrite sur son disque. Le coût annoncé et le payeur apparaissent sur la carte ; le cycle de fin de demande prévoit la révocation de la clé. Ce chemin dépend d'une configuration de financement valide.

Le propriétaire peut aussi utiliser sa propre clé. La démo historique suit ce second chemin. Les valeurs par défaut et les fournisseurs peuvent évoluer : les prix et disponibilités ne sont pas garantis par cette documentation. Voir [D20, D21 et D27](DECISIONS.md) et les [tests de financement](../packages/node/test/funding.test.ts).

## Essayer le prototype

### Vérifier le dépôt sans utiliser de modèle

Prérequis : un clone du dépôt, Node **22.18 ou supérieur**, et la version de pnpm déclarée dans `package.json` (**11.27.0** lors de ce bilan). Depuis la racine :

```bash
pnpm install --frozen-lockfile
pnpm -r lint
pnpm -r typecheck
pnpm -r test
```

Les tests incluent des parcours avec relais et Nodes locaux, ainsi que des fournisseurs simulés. Ils ne nécessitent pas de clé LLM.

### Voir le site et la documentation

```bash
pnpm site:preview
```

Ouvrir l'adresse locale affichée. La prévisualisation est séparée du produit : sa démonstration n'envoie aucune demande. `pnpm site:build` prépare les fichiers statiques dans `dist/site/`.

### Rejouer la démo complète

```bash
bash scripts/demo-local.sh
```

Le script crée un dossier temporaire, un relais et trois Nodes, puis joue le résumé d'erreurs et la question sur le dépôt. Il utilise les ports **7790 à 7793**, qui doivent être libres, et arrête ses processus en quittant. Il laisse le dossier de démonstration pour inspection.

**La partie `repo.answer` utilise le réseau et requiert une clé OpenRouter.** Le script lit `OPENROUTER_API_KEY`, ou essaie une entrée du trousseau macOS nommée `OpenRouter API Key`. Il ne faut pas présenter ce script comme une démonstration entièrement hors ligne ou sans prérequis. Sa durée dépend aussi du fournisseur. La clé doit être configurée dans l'environnement, jamais ajoutée au dépôt.

### Brancher son agent

Initialiser un Node avec l'URL d'un relais autorisé, puis lancer `serve`. L'identité locale vit par défaut dans `~/.drop` ; les clés privées sont créées en mode `0600`.

```bash
node packages/node/src/cli.ts help
node packages/node/src/cli.ts init --name Guillaume --kind human --relay <URL_DU_RELAIS>
node packages/node/src/cli.ts serve
```

Remplacer `<URL_DU_RELAIS>` par l'adresse obtenue auprès de son opérateur. L'admission et l'appairage nécessitent une invitation valide, ou l'autorisation d'amorçage du relais. Le [guide du connecteur](../packages/requester-mcp/README.md) donne les configurations Claude Code et Codex.

L’installation locale du connecteur est aussi disponible après assemblage :

```bash
node scripts/bundle.ts
node packages/node/src/cli.ts install codex
```

Remplacer `codex` par `claude_code`, `cursor` ou `claude_desktop` selon l’agent. Cette commande modifie sa configuration. `uninstall <agent>` retire le connecteur. Le paquet npm public n’est pas encore publié. `node scripts/bundle.ts` nettoie `dist/` : reconstruire ensuite le site si nécessaire.

Un annuaire d’équipe est implémenté : `team create <nom>` initialise l’équipe ; les invitations propagent l’adhésion et l’appairage ; `team` liste les membres, leurs agents et leurs capacités. Un shell Mac existe ; sa distribution et son parcours privé restent à terminer.

Pour examiner les agents reconnus et les sources déjà configurées :

```bash
node packages/node/src/cli.ts detect
node packages/node/src/cli.ts help
```

La commande `share <agent>/<serveur>` permet ensuite de publier une source existante. Vérifier les outils choisis avant le partage. Les identifiants du serveur restent lus depuis la configuration locale de l'agent.

## Si une demande n'aboutit pas

| Situation                          | Lecture utile                                                     |
| ---------------------------------- | ----------------------------------------------------------------- |
| Aucune capacité visible            | Vérifier l'appairage, la publication et la connexion des Nodes    |
| Entrée invalide                    | Corriger les champs demandés ; rien n'a été envoyé                |
| Refus ou expiration                | L'action n'a pas été autorisée ; ne pas contourner cette décision |
| Résultat en attente                | Un humain peut devoir autoriser ou relire la réponse              |
| Erreur de modèle ou budget dépassé | Vérifier la configuration du fournisseur et le budget annoncé     |
| Sortie rejetée                     | Le contrôle du schéma ou le scanner a bloqué l'envoi              |

## Pour contribuer

Les critères du futur profil privé sont dans [ACCEPTANCE](ACCEPTANCE.md), à promouvoir dans les specs lors de leur implémentation. Le contrat normatif est dans [openspec/specs](../openspec/specs/). La vision, l'architecture et ce guide sont descriptifs. [TASKS.md](TASKS.md) fixe l'ordre du travail ; [DECISIONS.md](DECISIONS.md) conserve les choix et leurs évolutions ; [AGENTS.md](../AGENTS.md) décrit la méthode de contribution.

Sources principales de ce guide : [CLI](../packages/node/src/cli.ts), [outils MCP](../packages/requester-mcp/src/tools.ts), [registre des capacités](../packages/capabilities/src/index.ts), [pipeline](../packages/runner/src/run.ts), [fournisseur du modèle](../packages/capabilities/src/llm.ts), [cycle de vie](../packages/protocol/src/lifecycle.ts), [démo](../scripts/demo-local.sh).
