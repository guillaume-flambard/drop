# Où en est drop ?

## 10 octobre 2026 : repositionnement

**Ce qui a changé.** Un grilling avec Guillaume a fixé D47 à D58 (`docs/DECISIONS.md`, section « Repositionnement »). Ces décisions précisent D34 à D38 sans les annuler : la souveraineté reste la référence de conception.

- **Positionnement (D47, D52).** « La réponse, pas l'accès » : le propriétaire valide la réponse qui sort ; drop se place comme couche de consentement humain au-dessus d'A2A.
- **Cible (D48).** Guillaume, puis deux amis techniques ; conception selon les exigences d'une grande entreprise souveraine. D31 (grand public) n'est plus une cible de départ.
- **Échelle des échanges (D50).** Le niveau « capacité » existe (`packages/runner`, `packages/capabilities`). Faits publiés (T4.4), petite question (T4.9) et tâche déléguée (T4.11) sont visés ; la conversation libre reste exclue. Ceci remplace l'exclusion de la délégation dans l'ancienne vision.
- **Contexte partagé décentralisé (D51).** Visé (T4.12) ; le RAG central reste exclu. Ceci remplace l'exclusion du contexte partagé.
- **Propriétaire sans agent (D49).** Réponse à la main visée (T4.3), agent inclus visé (T4.8).
- **Connexion (D53) et politique d'entreprise (D54).** Réseau local, iroh et relais d'entreprise visés (T4.2, T4.10), sans relais de secours par défaut. Aujourd'hui, les Nodes passent par un relais WebSocket configuré (`packages/relay`).
- **Raccordement (D55).** Quatre adaptateurs existent (T3.3, `packages/node/src/onboarding.ts`) ; treize clients sont visés (T4.5).
- **Simulation (D56).** Visée (T4.1, T4.7), sur le Mac avec un relais dédié, jamais sur le VPS.
- **Argent et nom (D57).** Rien de payant avant d'avoir des utilisateurs ; « drop » reste un nom de code.
- **Documents et phases (D58).** Phases P0 à P5 ; aucune information fausse ne doit rester dans le dépôt ni sur le site.

**Documents produit (T4.0, done).** [`docs/product/`](product/PRD.md) porte PRD, TRD, APP_FLOW, UX_UI, BACKEND_SCHEMA et IMPLEMENTATION_PLAN, avec les statuts existant, visé et hypothèse ([archive](../openspec/changes/archive/2026-10-10-t4-0-product-docs/evidence.md)). Ils deviennent la référence descriptive ; les specs OpenSpec restent seules normatives et `docs/TASKS.md` reste seul maître de l'ordre.

**Mise en vérité (T4.0a, faite).** README, guide, raccordement et ce bilan sont alignés sur D47 à D58 et sur le code. Corrections faites dans ces pages : le raccordement en deux confirmations est livré (T3.3) et non plus « à livrer » ; le serveur MCP expose six outils (`packages/requester-mcp/src/server.ts`) et non quatre ; le partage depuis le panneau se fait en un clic avec les outils marqués en lecture seule, sans choix du modèle ni de l'approbateur ; le retrait de champs à la relecture n'existe que sur la page historique `/` et en ligne de commande ; `drop://link` est refusé en profil privé ; la démo joue Julie sur un dépôt de code, en profil historique. Vision, architecture, PRODUCT.md, AGENTS.md, contexte OpenSpec et site sont aussi alignés ; la spec `product-foundation` est mise à jour avec l’accord de Guillaume.

**Écarts de code ajoutés à l'index.** T4.0 a relevé des écarts entre le panneau, les specs et la configuration ([APP_FLOW §6](product/APP_FLOW.md#6-écarts-relevés-pendant-la-rédaction)). Ils sont portés par trois nouvelles lignes `todo` :

- **T4.14**, panneau conforme à la spec node : expiration, « Sensibilité haute » et « Pas maintenant » par défaut sur la carte ; retrait de champs à la relecture ; confirmation avant d'accepter un lien `drop://pair` ; clic sur la notification qui ouvre le panneau ; traduction de `E_STATE`.
- **T4.15**, hygiène de configuration : défaut `profile: legacy` du schéma alors que `drop init` crée un profil privé ; mode `0600` pour `peers.json`, `team.json` et `relay.config.json` ; `E_QUEUE_FULL` dans `ERROR_CODES` ; commentaire D21 périmé dans `messages.ts` ; liste d'agents du protocole plus étroite que la détection ; `payer: owner` imposé par le schéma en profil privé.
- **T4.16**, partage depuis le panneau : choisir outils, modèle et approbateur comme la CLI, et ne pas publier un partage sans modèle utilisable.

**App Mac.** Une build notarisée a été acceptée par Apple le 10 octobre 2026 sur le Mac de Guillaume. Elle n'est pas encore archivée comme preuve de T3.4, qui reste `blocked` : la preuve doit être archivée, et la recette VoiceOver et l'installation sur un Mac de test restent humaines.

**Ce qui n'a pas changé.** Rien n'a encore été validé avec de vrais utilisateurs. Julie et Natha sont des scénarios ; toutes les démonstrations ont tourné sur les machines de Guillaume. La série T3 garde son ordre : T3.1b est en cours, T3.1c est bloquée, et l'essai avec deux amis (T4.6) attend notamment la clôture CSO de T3.1c. Le besoin (D24) n'est pas mesuré.

## Bilan du 9 octobre 2026 (conservé)

Ce bilan est conservé tel qu'il a été écrit, sauf les passages marqués « corrigé le 10 octobre ». Ses chiffres de tests datent de ce jour-là ; l'index cite depuis 353 tests verts pour T3.1b ([TASKS](TASKS.md)).

T3.1 implémente le profil privé sur la base de T3.0/T3.0a. Ce bilan ne certifie ni un serveur distant ni une distribution publique.

**Le runtime privé est implémenté et son cycle fonctionne sans Internet avec des fixtures internes.** Le raccordement en deux confirmations est vérifié dans le panneau local sur fixtures et attend une recette humaine sur Mac ; son usage dans une app distribuée reste à valider. La qualification d’un vrai modèle et la distribution Mac restent à livrer. Tauri existe déjà sur Mac ; son bootstrap choisit désormais un relais privé. T3.4a refuse le jeton local absent ou vide avant toute écoute ; tests, essai du binaire et relectures ciblées passent. Le chantier Mac T3.4 reste bloqué par la distribution signée/notarisée et la recette VoiceOver réelle.

Le schéma des chantiers du 9 octobre (`diagrams/roadmap.svg`) ne montre que la série T3 ; les phases actuelles sont dans le [plan d’implémentation](product/IMPLEMENTATION_PLAN.md).

### Ce qui existe dans le code

| Partie                                           | Preuve inspectable                                                                              | Limite                                                                                                                                                                       |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identité, enveloppes, anti-rejeu                 | [Protocole et tests](../packages/protocol/)                                                     | Ne prouve pas toute la confidentialité applicative                                                                                                                           |
| Relais, admission, équipes                       | [Relais](../packages/relay/), [tests Node](../packages/node/test/)                              | Admission, révocation et restauration revérifiées dans T3.1                                                                                                                  |
| Consentement, relecture, budgets, sorties        | [Node](../packages/node/), [runner](../packages/runner/)                                        | Pas de garantie absolue de non-divulgation                                                                                                                                   |
| Résumé d'erreurs, dépôt, MCP et A2A sortant      | [Capacités](../packages/capabilities/)                                                          | Connecteurs et modèles réels à qualifier par environnement                                                                                                                   |
| A2A entrant                                      | [Adaptateur](../packages/a2a/), commit `0e9caa8`                                                | SDK 1.3.0 ciblant A2A 1.0 ; pas une certification de tout le standard                                                                                                        |
| Questions d'équipe et demandes multiples         | [Connecteur MCP](../packages/requester-mcp/)                                                    | Routage borné, pas un orchestrateur général                                                                                                                                  |
| Détection et raccordement en deux confirmations  | [Détection](../packages/node/src/detect.ts), [raccordement](../packages/node/src/onboarding.ts) | Corrigé le 10 octobre : la transaction groupée est livrée (T3.3) ; quatre adaptateurs, treize visés (T4.5), recette sur Mac de test à faire                                  |
| Shell Mac de barre de menus                      | [Tauri](../apps/mac/)                                                                           | Corrigé le 10 octobre : T3.4 est `blocked`, pas en cours ; reprise bornée, erreur actionnable et clavier améliorés ; distribution signée et recette VoiceOver non qualifiées |
| Financement demandeur et passerelle grand public | [Financement](../packages/node/src/funding.ts), [gateway](../packages/gateway/)                 | Financement sans substitution ; passerelle exclue du profil privé, `drop://link` refusé en profil privé ; T2.13 non livrée                                                   |
| Mesure du besoin                                 | [Observer](../packages/blocked-observer/)                                                       | D24 attend toujours un agrégat qualifié concluant                                                                                                                            |

L’URL LLM proposée est Ollama local, sans choix implicite de modèle. Le propriétaire choisit son modèle et ses destinations, sans repli cloud. Aucun poids réel n’a encore été qualifié.

### Preuve T3.1

La recette Docker `--network none` exécute sept scénarios : installation neuve et invitation, accord/relecture/réponse via MCP et modèle, refus, panne du modèle, reprise du relais, reprise des Nodes, révocation et restauration. Capture sur toutes les interfaces du conteneur : **510 paquets, tous sur loopback, aucun paquet perdu par la capture**, aucune route externe ; la sonde extérieure échoue en `ENETUNREACH`. Les clés et contenus ne sont pas conservés dans la capture.

La [recette du profil privé](PRIVATE_PROFILE.md) explique installation, migration, retour arrière et exploitation. Limites explicites : IP privées littérales seulement, sans DNS ni redirection ; sources MCP stdio non isolées refusées ; les services autorisés doivent eux-mêmes être isolés par le client. Cette preuve utilise des fixtures, pas un vrai modèle ni un agent personnel. Les sorties restent soumises aux schémas et au scanner ; aucune promesse universelle de non-divulgation.

La revue indépendante de T3.1 n’avait pas trouvé de défaut P1/P2 résiduel dans les chemins examinés. La revue gstack de T3.1a a depuis classé **CRITICAL** une persistance non bornée des identifiants reçus, introduite dans T3.1. [T3.1b](TASKS.md) corrige ce défaut : UUIDv7 horodatés, stockage anti-rejeu plafonné et quota par identité après reconnexion. Les revues suivantes ont corrigé la reprise dangereuse d'un verrou étranger, la perte du fichier d'horloge, les trames rejetées par `ws` avant le quota et la double livraison d'une relecture concurrente, l'envoi laissé en attente par un refus de quota non corrélable et l'accumulation de fichiers temporaires après panne disque. Ces derniers défauts ont des tests rouges puis verts ; **350 tests / 37 fichiers**, lint, types, OpenSpec strict et 158 critères liés passent. Les passes gstack isolées ont aidé à trouver la double livraison mais sont incomplètes ; une passe formelle complète du diff stabilisé reste nécessaire avant archive. Le dernier CSO était partiel et confirmait un risque HIGH de croissance de `executing`. [T3.1c](TASKS.md) borne maintenant `executing`, `outbound`, `inbox`, `outbox` et le cache de rejeu, avec nettoyage sur refus du relais ou panne. Les créations de clés et vidages de file concurrents sont également bornés. Un CSO frais du diff entier n'a pas trouvé de nouveau constat étayé, mais reste partiel et ne clôt pas formellement le HIGH initial. La revue `/review` reste requise avant la preuve pilote T3.5. Les [preuves T3.1](../openspec/changes/archive/2026-10-09-t3-1-private-profile/evidence.md) conservent les résultats obtenus alors : 262 tests / 33 fichiers, lint/types, OpenSpec strict, bundles et compilation Rust. Le guard gèle toujours 256 critères historiques et en déclare 19 non testables.

### Ce que T3.0 prépare

- Vision et architecture privées, décisions D34 à D38, [critères d'exécution futurs](ACCEPTANCE.md).
- [Parcours deux confirmations](ONBOARDING.md), [modèles candidats](MODELS.md), index réordonné avec reprise des anciens restes.
- Licence Apache-2.0, contribution, signalement de sécurité et modèles GitHub.
- Landing et guide en prévisualisation locale, avec échanges simulés et limites explicites.

Vérification T3.0 : **245 tests réussis dans 26 fichiers**, lint/types et validation OpenSpec stricte verts. Le guard compte 355 critères : 75 liés à un test, 259 hérités gelés, 21 non testables (dont les six critères éditoriaux de T3.0). Baseline inchangée. Les [preuves et la revue](../openspec/changes/archive/2026-10-09-t3-0-sovereign-oss-foundation/evidence.md) sont conservées dans l’archive. Les critères documentaires ne comptent pas comme des tests du futur runtime. Un garde vert avec baseline signifie absence de nouvelle dette de traçabilité ; il ne signifie pas que chaque scénario hérité est couvert.

### Preuves historiques

La [démo conservée](demo/README.md) rapporte des passages Claude Code et Codex via le lab : résumé de logs du VPS et question sur un dépôt avec relecture. Le Node nommé Julie était sur le Mac de Guillaume, pas chez Julie. Le test humain de compréhension n'est pas prouvé. Ces captures ne démontrent pas le nouveau parcours privé.

L'ancien bilan `cacf1cc` est conservé dans l'historique Git. Ses chiffres de tests et tâches ne sont pas repris comme mesure actuelle.

### Ce qui reste

L'ordre unique est [TASKS](TASKS.md). Les corrections T3.1b et T3.1c sont implémentées et vérifiées par tests ; leurs revues formelles restent à terminer avant T3.1a et la preuve pilote. Suivent qualification de modèle et connexion, finition Mac, preuve d'ensemble, préparation de publication, Windows et Linux. Depuis le 10 octobre, la série T4 (phases P0 à P5) s'ajoute à cet ordre sans le remplacer ; voir la section du 10 octobre et le [plan d'implémentation](product/IMPLEMENTATION_PLAN.md). Les anciennes tâches en cours ont été remises à `todo` avec leur reprise explicite ; elles ne sont pas déclarées terminées.

**T3.1a** : le client MCP Hermes amont a passé les scénarios accord/refus/expiration dans un conteneur jetable sans Internet. Sa boucle d’agent appelle réellement le catalogue Drop avec un fournisseur local simulé ; une panne HTTP 503 remonte sans connexion externe observée. Décision : [recette manuelle facultative](HERMES.md), pas de nouvel adaptateur automatique ni de dépendance Hermes dans Drop. Modèles réels non qualifiés ; diagnostics de requête locaux Hermes à maîtriser avant usage sensible. **T3.2a**, adaptateurs AI SDK directs / passerelle LiteLLM privée, reste à réaliser. Le client Drop actuel est conservé. T3.1a reste en VERIFYING tant que le finding critique T3.1b laisse la revue de branche non clean.

D24 exige au moins trois développeurs et dix jours actifs chacun. Le GO exige au moins 0,5 blocage YES par développeur-jour et une médiane de dix minutes perdues. Aucun agrégat qualifié concluant n'est apporté par cette documentation.

Le dépôt demeure privé. Avant ouverture : audit de l'historique et des artefacts, attributions tierces, séparation de la CI du lab, signalement privé opérationnel, paquets vérifiés et accord du propriétaire. Voir [OPEN_SOURCE](OPEN_SOURCE.md).

## Reproduire la vérification

```bash
pnpm -r lint
pnpm -r typecheck
pnpm -r test
openspec validate --all --strict
npx --yes openspec-guard@0.3.0 check --require-selector --baseline .openspec-guard-baseline.json --fail-on fail
pnpm site:build
```

Ces tests ne requièrent ni clé modèle ni accès au lab. Le site est une présentation statique ; sa simulation ne connecte aucun agent et n'envoie aucune demande réelle.
