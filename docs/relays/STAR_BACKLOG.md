# Drop — backlog vivant en boucles STAR

> Document dérivé de [docs/TASKS.md](../TASKS.md). Les **statuts, priorités et dépendances** y restent canoniques ; ce registre ne les remplace pas. Génération reproductible par `node scripts/star-backlog.ts` ; synchronisation vérifiée par `node scripts/star-backlog.ts --check`.

## Contrat d’exécution

Chaque relais prend **une seule sous-tâche non revendiquée** : 1) lire le contexte et la spec normative, 2) écrire S/T/A avant tout changement, 3) implémenter + tests, 4) noter R avec preuves, 5) publier une PR et attendre les contrôles requis, 6) refaire le choix dans l’index mis à jour. Ne jamais déduire DONE d’un document ou d’une PR non fusionnée.

Les travaux qui réclament du matériel, des testeurs ou une décision humaine ne deviennent pas « faits » après une simple compilation. Aucun merge forcé, suppression de données, réparation automatique ou release stable par cette boucle.

## Situation du backlog (source : index, pas les PR en transit)

| Statut | Nombre |
| --- | ---: |
| done | 70 |
| todo | 28 |
| doing | 11 |
| blocked | 4 |
| deferred | 2 |
| superseded | 5 |
| **Total** | **120** |

**Ouvert : 43 chantiers.** Candidats sans dépendance non terminée : 13. « Prêt » signifie seulement qu’un agent peut instruire une sous-tâche, pas que toutes ses AC sont validées.

## Boucles STAR — tâches ouvertes

### T0.7 — blocked · bloqué / preuve humaine

**S — Situation.** Mesurer le besoin D24 sans attendre l'app : 3 à 5 développeurs qui codent avec des agents installent seulement blocked-observer, 10 jours actifs chacun, blocages classés en entretien ([codebook](CLASSIFICATION.md)), y compris les événements de Guillaume en attente ; verdict par blocked-observer report --merge. L'agent prépare le kit (guide d'installation relu, fiche d'entretien, consignes d'export). **Kit prêt** le 12/10 (PR…

**T — Tâche.** Contrat : `blocked-observer`. Change : [`t0-7-d24-measure`](../../openspec/changes/archive/2026-10-12-t0-7-d24-measure/). Dépend de : T0.6.

**A — Action suivante.** Préparer les exports et analyses, puis faire recruter et interviewer 3 à 5 développeurs et classer les événements D24.

**R — Résultat et preuve.** Journal de consentement, 10 jours actifs par testeur et rapport report --merge ; uniquement après entretiens réels. **État : BLOCKED dans l’index ; aucun succès nouveau revendiqué dans ce registre.**

**Sortie de boucle.** Tests ciblés → lint/typage → OpenSpec guard → revue sécurité si nécessaire → PR/CI sur les OS requis → archive OpenSpec et mise à jour de `docs/TASKS.md`. Décision ou témoignage humain indispensable.

### T3.4 — blocked · bloqué / preuve humaine

**S — Situation.** App Mac : finir T2.4 avec bootstrap privé, cycle de vie, clavier/VoiceOver, Node embarqué, signature/notarisation et mise à jour facultative vérifiée. **Fait** : builds signées et notarisées (PR #8), preuve de notarisation consignée le 10 octobre, revues formelles /review et /cso et gates verts le 12 octobre (aucun constat de sécurité soutenu). **Bloquée sur Guillaume**, aucune recette automatisable restante : installation du…

**T — Tâche.** Contrat : `owner-app`. Change : [`t3-4-private-mac-app`](../../openspec/changes/t3-4-private-mac-app/). Dépend de : T3.3.

**A — Action suivante.** Préparer la checklist et les traces ; réserver au propriétaire l’installation macOS propre, VoiceOver et veille.

**R — Résultat et preuve.** Recette réelle sur Mac propre, capture VoiceOver et justification de l’entitlement ; CI seule insuffisante. **État : BLOCKED dans l’index ; aucun succès nouveau revendiqué dans ce registre.**

**Sortie de boucle.** Tests ciblés → lint/typage → OpenSpec guard → revue sécurité si nécessaire → PR/CI sur les OS requis → archive OpenSpec et mise à jour de `docs/TASKS.md`. Recette matérielle indispensable.

### T4.31 — doing · attend dépendances

**S — Situation.** Suites du lien unique (T4.23) : plugin Tauri single-instance avec sa fonction deep-link pour que drop://join atteigne l'app déjà ouverte sous Windows et Linux ; panneau React : « Inviter » donne le lien https (link de POST /ui/invite), carte qui montre le relais (relayHost, relay), « Connecter mes agents » proposé après « Rejoindre » (next: 'connect_agents') ; liens directs vers les fichiers de release une fois leurs noms fix…

**T — Tâche.** Contrat : `owner-app`, `site`. Change : [`t4-25-one-link-follow-ups`](../../openspec/changes/archive/2026-10-12-t4-25-one-link-follow-ups/). Dépend de : T4.23, T3.7 et T3.8 (partie code seulement, D103).

**A — Action suivante.** Rapprocher le code single-instance, les liens deep-link et la page /join des AC ; isoler les derniers cas Windows/Linux.

**R — Résultat et preuve.** Tests de doublons de query, parcours URL→app déjà ouverte et recette réelle sur chaque système. **État : DOING dans l’index ; aucun succès nouveau revendiqué dans ce registre.**

**Sortie de boucle.** Tests ciblés → lint/typage → OpenSpec guard → revue sécurité si nécessaire → PR/CI sur les OS requis → archive OpenSpec et mise à jour de `docs/TASKS.md`. Recette matérielle indispensable.

### T3.7 — blocked · bloqué / preuve humaine

**S — Situation.** App Windows (D84) : Windows 10 et 11, même app que sur Mac (Tauri 2, WebView2), icône de la barre des tâches, lien drop:// enregistré à l'installation, démarrage automatique, notifications Windows, chemins et configurations des agents propres à Windows, installeur signé, tests du corpus commun sur Windows. **Fait** (D90, docs/RELEASE.md) : même coque, node.exe et drop-iroh.exe embarqués, installeurs NSIS et MSI construits et…

**T — Tâche.** Contrat : `owner-app`, `node`, `requester-mcp`. Change : `t3-7-windows-app` (change à localiser/créer). Dépend de : T3.4 (partie code seulement, D96), T4.15.

**A — Action suivante.** Valider l’emballage et le démarrage Windows sans prétendre à une installation physique ; préparer l’issue de signature.

**R — Résultat et preuve.** CI Windows verte, installateur signé Authenticode puis installation Windows 10 et 11 observée. **État : BLOCKED dans l’index ; aucun succès nouveau revendiqué dans ce registre.**

**Sortie de boucle.** Tests ciblés → lint/typage → OpenSpec guard → revue sécurité si nécessaire → PR/CI sur les OS requis → archive OpenSpec et mise à jour de `docs/TASKS.md`. Recette matérielle indispensable.

### T4.6c — todo · attend dépendances

**S — Situation.** Banc maison avant l'essai (D84) : le VPS, le Mac de Guillaume et deux PC Windows (10 et 11) forment une équipe de quatre par le lien de T4.23 ; scénarios : résumé des erreurs du VPS sans modèle, question répondue à la main, fait publié, refus, expiration, onglet « Équipe » à quatre ; chaque accroc devient une correction

**T — Tâche.** Contrat : `node`, `owner-app`, `relay`, `deploy-mac-vps`. Change : `t4-6c-home-bench` (change à localiser/créer). Dépend de : T3.7, T4.22, T4.23, T4.6a.

**A — Action suivante.** Préparer les scénarios à quatre machines sans les jouer tant que les deux PC ne sont pas disponibles.

**R — Résultat et preuve.** Quatre nœuds réels et preuve cross-network, consentement, refus, fait publié et reprise. **État : TODO dans l’index ; aucun succès nouveau revendiqué dans ce registre.**

**Sortie de boucle.** Tests ciblés → lint/typage → OpenSpec guard → revue sécurité si nécessaire → PR/CI sur les OS requis → archive OpenSpec et mise à jour de `docs/TASKS.md`. Recette matérielle indispensable.

### T3.8 — blocked · bloqué / preuve humaine

**S — Situation.** App Linux (D84) : paquets (AppImage, deb), WebKitGTK, GNOME et KDE, X11 et Wayland ; l'icône n'émet pas de clic sous Linux (doc Tauri 2), donc tout passe par son menu ; chemins des agents propres à Linux, tests du corpus commun. **Fait** (D90, docs/RELEASE.md) : AppImage et deb x64 et arm64 construits sur Ubuntu 22.04 et testés en CI (paquets dépaquetés, Node embarqué, daemon qui s'arrête avec son parent), menu « Ouvrir le pa…

**T — Tâche.** Contrat : `owner-app`, `node`, `requester-mcp`. Change : `t3-8-linux-app` (change à localiser/créer). Dépend de : T3.7.

**A — Action suivante.** Tester packaging Linux en CI et recenser les besoins GNOME/KDE, X11/Wayland et deep-links.

**R — Résultat et preuve.** Builds reproductibles puis recette physique des quatre environnements de bureau retenus. **État : BLOCKED dans l’index ; aucun succès nouveau revendiqué dans ce registre.**

**Sortie de boucle.** Tests ciblés → lint/typage → OpenSpec guard → revue sécurité si nécessaire → PR/CI sur les OS requis → archive OpenSpec et mise à jour de `docs/TASKS.md`. Recette matérielle indispensable.

### T4.24 — todo · attend dépendances

**S — Situation.** Design impeccable (D84) : audit puis refonte du panneau et du parcours d'arrivée sur Mac, Windows et Linux (hiérarchie, textes, états vides et d'erreur, clavier, lecteur d'écran, thèmes clair et sombre, petites et grandes fenêtres) ; recette visuelle de Guillaume. Cible du lot A de docs/research/2026-10-12-openwhispr.md : un seul jeu de tokens (surfaces, bordures, rayons, ombres, un seul accent à la place des trois violets ac…

**T — Tâche.** Contrat : `owner-app`, `node`. Change : `t4-24-impeccable-panel` (change à localiser/créer). Dépend de : T3.7.

**A — Action suivante.** Auditer les états de la UI, accessibilité clavier/lecteur d’écran, tailles et thèmes avant recette visuelle.

**R — Résultat et preuve.** Tests de composants et acceptation visuelle sur Mac/Windows/Linux par le propriétaire. **État : TODO dans l’index ; aucun succès nouveau revendiqué dans ce registre.**

**Sortie de boucle.** Tests ciblés → lint/typage → OpenSpec guard → revue sécurité si nécessaire → PR/CI sur les OS requis → archive OpenSpec et mise à jour de `docs/TASKS.md`. Recette matérielle indispensable.

### T4.30 — doing · préqualification autorisée

**S — Situation.** Actions sur les notifications de demande, trouvé le 12 octobre 2026 en lisant OpenWhispr (commit 5f9a88b). Décisions de Guillaume du même jour : deux boutons seulement, « Voir » (ouvre la carte complète) et « Refuser », jamais « Autoriser » hors de la carte complète, puisque la notification coupe le texte du pair à 200 caractères ; aucun passe-outre du mode Concentration. « Refuser » passe par le même chemin de décision du No…

**T — Tâche.** Contrat : `owner-app`, `node`. Change : [`t4-30-notification-actions`](../../openspec/changes/archive/2026-10-12-t4-30-notification-actions/). Dépend de : T4.14.

**A — Action suivante.** Implémenter « Voir »/« Refuser » en conservant le chemin de décision Node ; jamais d’autorisation dans la notification.

**R — Résultat et preuve.** Tests de notification expirée, déjà tranchée, mode Concentration et protection partage d’écran. **État : DOING dans l’index ; aucun succès nouveau revendiqué dans ce registre.**

**Sortie de boucle.** Tests ciblés → lint/typage → OpenSpec guard → revue sécurité si nécessaire → PR/CI sur les OS requis → archive OpenSpec et mise à jour de `docs/TASKS.md`. Pas d’installation physique nécessaire pour le prochain sous-traitement logiciel.

### T4.35 — doing · préqualification autorisée

**S — Situation.** Carte de consentement au niveau d'OpenWhispr (lot B de docs/research/2026-10-12-openwhispr.md) : états nommés (en attente, décision en cours, autorisée, refusée, expirée, incertaine) avec une phrase qui dit ce qui est arrivé aux données (« Rien n'a été envoyé ») ; seule une carte en attente peut expirer, un résultat illisible devient « incertaine » ; une seule région aria-live par surface, focus sur la carte après la décision…

**T — Tâche.** Contrat : `owner-app`, `node`. Change : [`t4-35-consent-card`](../../openspec/changes/archive/2026-10-12-t4-35-consent-card/). Dépend de : T4.14.

**A — Action suivante.** Finir les états de la carte de consentement, annonces aria-live, focus et refus de clics périmés ; comparer la carte du panneau et celle de l’espace.

**R — Résultat et preuve.** Tests des six états et parcours clavier, non-divulgation du texte du pair et consentement explicite avant envoi. **État : DOING dans l’index ; aucun succès nouveau revendiqué dans ce registre.**

**Sortie de boucle.** Tests ciblés → lint/typage → OpenSpec guard → revue sécurité si nécessaire → PR/CI sur les OS requis → archive OpenSpec et mise à jour de `docs/TASKS.md`. Pas d’installation physique nécessaire pour le prochain sous-traitement logiciel.

### T4.36 — todo · attend dépendances

**S — Situation.** Coque qui se fait oublier (lot C de docs/research/2026-10-12-openwhispr.md) : icône de barre de menus à états (demandes en attente, hors ligne, erreur de démarrage) ; mise à jour lisible (progression, « prête » une fois, confirmation avant redémarrage, notes de version, échec montré) ; démarrage automatique en vrai réglage au lieu de l'enable() forcé à chaque lancement, état « approbation requise » de macOS montré ; Dock visi…

**T — Tâche.** Contrat : `owner-app`. Change : `t4-36-quiet-shell` (change à localiser/créer). Dépend de : T3.7.

**A — Action suivante.** Réconcilier cycle de vie de la coque, autostart choisi, Dock, états de la menubar et fermeture de tous les processus.

**R — Résultat et preuve.** Tests de processus orphelins et reprise, fenêtre bornée, états visibles et validation réelle des autorisations système. **État : TODO dans l’index ; aucun succès nouveau revendiqué dans ce registre.**

**Sortie de boucle.** Tests ciblés → lint/typage → OpenSpec guard → revue sécurité si nécessaire → PR/CI sur les OS requis → archive OpenSpec et mise à jour de `docs/TASKS.md`. Recette matérielle indispensable.

### T4.37 — doing · préqualification autorisée

**S — Situation.** Journaux et diagnostic (lot D de docs/research/2026-10-12-openwhispr.md) : daemon.log gardé au lieu d'être vidé à chaque démarrage, rotation par taille et âge, en-tête système, expurgation dans l'écriture même (motifs et noms de clés) ; version affichée ; section « Diagnostic » : ouvrir le dossier des journaux, copier son chemin, copier un diagnostic expurgé ; la page de démarrage donne le chemin du journal ; l'espace affiche…

**T — Tâche.** Contrat : `owner-app`, `node`. Change : [`t4-37-diagnostics`](../../openspec/changes/archive/2026-10-12-t4-37-diagnostics/). Dépend de : aucune.

**A — Action suivante.** Fiabiliser la rotation et l’expurgation des journaux, les diagnostics copiables, leur accès authentifié et les erreurs lisibles.

**R — Résultat et preuve.** Tests de suppression des secrets, rotation, affichage diagnostic et refus des endpoints non authentifiés. **État : DOING dans l’index ; aucun succès nouveau revendiqué dans ce registre.**

**Sortie de boucle.** Tests ciblés → lint/typage → OpenSpec guard → revue sécurité si nécessaire → PR/CI sur les OS requis → archive OpenSpec et mise à jour de `docs/TASKS.md`. Pas d’installation physique nécessaire pour le prochain sous-traitement logiciel.

### T4.28 — todo · préqualification autorisée

**S — Situation.** CI aiguillée par chemins modifiés, trouvé le 12 octobre 2026 en lisant OpenWhispr (.github/scripts/ci-scope.cjs, commit 5f9a88b) : un script classe les chemins du diff (docs seules, code, workflows et scripts partagés) et ne lance que les jobs concernés ; le classement a ses propres tests ; un fichier partagé ou un diff illisible relance tout. Vérifier dans la doc GitHub comment un job sauté compte pour les contrôles obligato…

**T — Tâche.** Contrat : `monorepo-tooling`. Change : `t4-28-ci-path-routing` (change à localiser/créer). Dépend de : T4.32.

**A — Action suivante.** Réconcilier le statut avec la PR #99 fusionnée ; vérifier qu’aucun filtre ne fait disparaître les checks protégés.

**R — Résultat et preuve.** PR #99, checks test/test-windows/test-macos et merge_group verts ; tests du classificateur. **État : TODO dans l’index ; aucun succès nouveau revendiqué dans ce registre.**

**Sortie de boucle.** Tests ciblés → lint/typage → OpenSpec guard → revue sécurité si nécessaire → PR/CI sur les OS requis → archive OpenSpec et mise à jour de `docs/TASKS.md`. Pas d’installation physique nécessaire pour le prochain sous-traitement logiciel.

### T4.38 — doing · préqualification autorisée

**S — Situation.** Test du relais instable sous forte charge, trouvé en T3.1f (12 octobre 2026) : « restores a sender once its rate window has passed » échoue 3 fois sur 72 passages sous charge parallèle. Trouver la cause (temps réel contre fenêtre de cadence) avant de toucher au délai, sans affaiblir ce que le test protège

**T — Tâche.** Contrat : `relay`. Change : [`t4-38-relay-rate-window-flake`](../../openspec/changes/archive/2026-10-12-t4-38-relay-rate-window-flake/). Dépend de : T3.1f.

**A — Action suivante.** Reproduire sous charge la fenêtre de débit du relais ; distinguer horloge réelle, timers et quotas avant tout changement.

**R — Résultat et preuve.** Test de reprise après la fenêtre de cadence et répétitions CI sans allonger arbitrairement les limites. **État : DOING dans l’index ; aucun succès nouveau revendiqué dans ce registre.**

**Sortie de boucle.** Tests ciblés → lint/typage → OpenSpec guard → revue sécurité si nécessaire → PR/CI sur les OS requis → archive OpenSpec et mise à jour de `docs/TASKS.md`. Pas d’installation physique nécessaire pour le prochain sous-traitement logiciel.

### T4.39 — doing · préqualification autorisée

**S — Situation.** Suites de T3.1f (revue du 12 octobre 2026) : une demande drop_request jamais acquittée est présentée au demandeur comme refusée alors que le destinataire a pu la recevoir (statut à corriger, pas à deviner) ; une erreur du relais sans identifiant n'est libérée que par le délai ; sur une liaison lente (vers 140 kbit/s et moins) la connexion peut tomber ou renvoyer en boucle une grosse enveloppe

**T — Tâche.** Contrat : `relay`, `node`, `requester-mcp`. Change : [`t4-39-relay-liveness-followups`](../../openspec/changes/archive/2026-10-12-t4-39-relay-liveness-followups/). Dépend de : T3.1f.

**A — Action suivante.** Séparer résultat inconnu et véritable refus après acquittement manquant ; borner l’attente et la reprise des messages.

**R — Résultat et preuve.** Tests ACK perdu, reconnect, fermeture, duplications et succès non confirmé correctement marqué incertain. **État : DOING dans l’index ; aucun succès nouveau revendiqué dans ce registre.**

**Sortie de boucle.** Tests ciblés → lint/typage → OpenSpec guard → revue sécurité si nécessaire → PR/CI sur les OS requis → archive OpenSpec et mise à jour de `docs/TASKS.md`. Pas d’installation physique nécessaire pour le prochain sous-traitement logiciel.

### T4.40 — todo · attend dépendances

**S — Situation.** Suites de T4.33 et de la revue de T4.24 (12 octobre 2026) : les autres échecs d'écriture du lien unique (droits, disque plein) répondent encore E_INVITE_RELAY au lieu de leur vraie cause ; E_CONFLICT n'est testé qu'au niveau du moteur, pas par l'API ; la carte de raccordement d'un assistant propose « Autoriser » quand la liste de ses outils n'a pas pu être lue (le Node revérifie, mais le bouton trompe) ; quatre anciens tests…

**T — Tâche.** Contrat : `node`, `owner-app`. Change : `t4-40-join-and-panel-followups` (change à localiser/créer). Dépend de : T4.33, T4.24.

**A — Action suivante.** Corriger invitations et panneau dans l’ordre après la refonte et l’audit du premier parcours ; préserver consentement et état.

**R — Résultat et preuve.** Tests des liens, expiration, carte, erreurs et revue UX sur plusieurs tailles de fenêtre. **État : TODO dans l’index ; aucun succès nouveau revendiqué dans ce registre.**

**Sortie de boucle.** Tests ciblés → lint/typage → OpenSpec guard → revue sécurité si nécessaire → PR/CI sur les OS requis → archive OpenSpec et mise à jour de `docs/TASKS.md`. Pas d’installation physique nécessaire pour le prochain sous-traitement logiciel.

### T4.41 — todo · attend dépendances

**S — Situation.** Première version téléchargeable pour l'essai : nouvelle build Mac notarisée qui contient T4.23 (la seule notarisée date du 10 octobre), release GitHub en brouillon par le workflow de T3.7 et T3.8, vérification de la page du lien (https://drop.memolabs.dev/join seule répond 404 : à confirmer avec un vrai lien). Pousser le tag v* et publier la release reviennent à Guillaume

**T — Tâche.** Contrat : `owner-app`, `site`, `deploy-mac-vps`. Change : `t4-41-first-trial-release` (change à localiser/créer). Dépend de : T3.7, T3.8, T3.4.

**A — Action suivante.** Préparer une première release de testeurs reproductible, vérifier manifeste et signatures sans publier stable.

**R — Résultat et preuve.** Artefacts horodatés, vérifications de signatures et installation réelle sur plateformes requises. **État : TODO dans l’index ; aucun succès nouveau revendiqué dans ce registre.**

**Sortie de boucle.** Tests ciblés → lint/typage → OpenSpec guard → revue sécurité si nécessaire → PR/CI sur les OS requis → archive OpenSpec et mise à jour de `docs/TASKS.md`. Recette matérielle indispensable.

### T4.44 — todo · attend dépendances

**S — Situation.** Réponse exploitable côté demandeur, trouvé le 12 octobre 2026 dans l'étude Tailscale, Glean et OpenZiti (docs/research/2026-10-12-tailscale-glean-openziti.md) : la réponse rendue par requester-mcp et affichée dans le panneau porte, en plus de qui l'a fournie et par quelle capacité (déjà fait), l'heure de la réponse, l'heure et l'auteur de l'autorisation, la fraîcheur de la source quand la capacité la connaît, et ce que la rép…

**T — Tâche.** Contrat : `requester-mcp`, `protocol`, `owner-app`, capacités. Change : `t4-44-answer-provenance` (change à localiser/créer). Dépend de : T4.39.

**A — Action suivante.** Rendre la progression d’une demande visible et attribuable sans inventer des événements de livraison.

**R — Résultat et preuve.** Tests d’état pending/sent/unknown/received, reconnexion et non-divulgation du contenu brut. **État : TODO dans l’index ; aucun succès nouveau revendiqué dans ce registre.**

**Sortie de boucle.** Tests ciblés → lint/typage → OpenSpec guard → revue sécurité si nécessaire → PR/CI sur les OS requis → archive OpenSpec et mise à jour de `docs/TASKS.md`. Pas d’installation physique nécessaire pour le prochain sous-traitement logiciel.

### T4.45 — todo · attend dépendances

**S — Situation.** Cause d'échec en langage clair côté demandeur, même source : chaque échec dit s'il vient de la connexion (hors ligne, non confirmée, injoignable), d'une permission (pair non admis, capacité absente), du modèle (sortie invalide, délai) ou d'un refus du propriétaire, avec quoi faire ensuite ; table unique code vers cause, testée sur chaque code stable de ERROR_CODES ; les chemins directs ne disent plus « injoignable » sans preu…

**T — Tâche.** Contrat : `requester-mcp`, `node`, `protocol`. Change : `t4-45-plain-failure-causes` (change à localiser/créer). Dépend de : T4.39.

**A — Action suivante.** Traduire les erreurs codes en phrases claires, détails repliables et consignes non dangereuses ; pas de faux « réessayer ».

**R — Résultat et preuve.** Tests des erreurs E_RATE, E_RUNNER, E_SCHEMA et réseau, accessibilité clavier et messages localisés. **État : TODO dans l’index ; aucun succès nouveau revendiqué dans ce registre.**

**Sortie de boucle.** Tests ciblés → lint/typage → OpenSpec guard → revue sécurité si nécessaire → PR/CI sur les OS requis → archive OpenSpec et mise à jour de `docs/TASKS.md`. Pas d’installation physique nécessaire pour le prochain sous-traitement logiciel.

### T4.46 — doing · attend dépendances

**S — Situation.** Audit du premier parcours de bout en bout, conseil de Guillaume du 12 octobre 2026 : « Créer une équipe, inviter, demander, autoriser, recevoir » joué comme un nouvel utilisateur qui ne connaît ni MCP, ni A2A, ni le P2P, d'abord sur une machine avec deux espaces drop distincts, avec une capture et une note à chaque écran ; chaque blocage, mot technique visible ou attente sans explication devient une correction ou une ligne to…

**T — Tâche.** Contrat : `owner-app`, `node`, `requester-mcp`, `site`. Change : `t4-46-first-run-audit` (change à localiser/créer). Dépend de : T4.31.

**A — Action suivante.** Auditer le premier parcours sur deux espaces isolés d’une machine, noter chaque écran et créer une tâche par blocage vérifiable.

**R — Résultat et preuve.** Parcours équipe→invitation→demande→autorisation→réponse avec captures expurgées et corrections liées à une AC. **État : DOING dans l’index ; aucun succès nouveau revendiqué dans ce registre.**

**Sortie de boucle.** Tests ciblés → lint/typage → OpenSpec guard → revue sécurité si nécessaire → PR/CI sur les OS requis → archive OpenSpec et mise à jour de `docs/TASKS.md`. Pas d’installation physique nécessaire pour le prochain sous-traitement logiciel.

### T4.47 — todo · attend dépendances

**S — Situation.** Historique visible, même source : le panneau et l'espace montrent les dernières demandes reçues et envoyées, les réponses, les refus et expirations, et pour chaque réponse sortie ce qui a été transmis et à qui, lu dans les reçus signés (métadonnées et empreintes, jamais le contenu brut gardé hors du reçu)

**T — Tâche.** Contrat : `owner-app`, `node`. Change : `t4-47-visible-history` (change à localiser/créer). Dépend de : T4.35.

**A — Action suivante.** Concevoir un historique de demandes utilisateur lisible, borné et expurgé, après stabilisation de la carte de consentement.

**R — Résultat et preuve.** Tests d’expiration, de redaction, de navigation, de performance et de suppression contrôlée. **État : TODO dans l’index ; aucun succès nouveau revendiqué dans ce registre.**

**Sortie de boucle.** Tests ciblés → lint/typage → OpenSpec guard → revue sécurité si nécessaire → PR/CI sur les OS requis → archive OpenSpec et mise à jour de `docs/TASKS.md`. Pas d’installation physique nécessaire pour le prochain sous-traitement logiciel.

### T3.2 — doing · préqualification autorisée

**S — Situation.** Modèles : réutilisation d'endpoint ou agent interne, choix local consenti, qualification Qwen3.5 4B/9B, mémoire/qualité/latence et erreurs

**T — Tâche.** Contrat : `runner`, `owner-app`, `capability-repo-answer`, `capability-mcp-answer`. Change : `t3-2-local-model-qualification` (change à localiser/créer). Dépend de : T3.1.

**A — Action suivante.** Isoler un endpoint local, comparer modèles 4B/9B et évaluer mémoire, qualité et erreur sans repli cloud.

**R — Résultat et preuve.** Bench reproductible, données/latence/mémoire et décision de modèle local, avec consentement explicite. **État : DOING dans l’index ; aucun succès nouveau revendiqué dans ce registre.**

**Sortie de boucle.** Tests ciblés → lint/typage → OpenSpec guard → revue sécurité si nécessaire → PR/CI sur les OS requis → archive OpenSpec et mise à jour de `docs/TASKS.md`. Pas d’installation physique nécessaire pour le prochain sous-traitement logiciel.

### T4.16 — todo · attend dépendances

**S — Situation.** Partage depuis le panneau, écart trouvé en T4.0a : choisir outils, modèle et approbateur comme la CLI ; ne pas publier un partage sans modèle utilisable (aujourd’hui fournisseur local sans modèle, échec E_SCHEMA à l’exécution, lu dans llm.ts). Facultative pour l'essai si Guillaume le limite aux réponses à la main et aux faits publiés

**T — Tâche.** Contrat : `owner-app`, `node`, `capability-mcp-answer`. Change : `t4-16-panel-sharing` (change à localiser/créer). Dépend de : T3.2.

**A — Action suivante.** Refuser tout partage de modèle inexécutable ; proposer le choix du fournisseur, outil et approbateur dans le panneau.

**R — Résultat et preuve.** AC de consentement et test de publication avec et sans modèle local disponible. **État : TODO dans l’index ; aucun succès nouveau revendiqué dans ce registre.**

**Sortie de boucle.** Tests ciblés → lint/typage → OpenSpec guard → revue sécurité si nécessaire → PR/CI sur les OS requis → archive OpenSpec et mise à jour de `docs/TASKS.md`. Pas d’installation physique nécessaire pour le prochain sous-traitement logiciel.

### T4.6 — todo · attend dépendances

**S — Situation.** P1 : essai en binômes de collègues (D83) : chaque testeur vient avec une personne avec qui il travaille vraiment, pour que les questions posées par drop soient réelles ; au moins deux binômes dans des contextes différents ; protocole d'observation et mesures d'usage du PRD. Le besoin (D24) se mesure en T0.7 ; la compréhension par des non-techniciens (H3) demande un test séparé

**T — Tâche.** Contrat : `deploy-mac-vps`. Change : `t4-6-friends-trial` (change à localiser/créer). Dépend de : T0.7 (verdict GO ou à prolonger), T3.1b, T3.1c, T3.4, T3.7, T3.8, T4.15, T4.22, T4.23, T4.24, T4.6c, T4.6b ; T4.16 si l'essai inclut le partage par modèle.

**A — Action suivante.** Attendre le verdict D24 et les recettes plateformes, préparer l’observation des binômes et les métriques.

**R — Résultat et preuve.** Deux binômes réels, mesures première réponse, refus, connexions et compte rendu consenti. **État : TODO dans l’index ; aucun succès nouveau revendiqué dans ce registre.**

**Sortie de boucle.** Tests ciblés → lint/typage → OpenSpec guard → revue sécurité si nécessaire → PR/CI sur les OS requis → archive OpenSpec et mise à jour de `docs/TASKS.md`. Décision ou témoignage humain indispensable.

### T3.1d — doing · préqualification autorisée

**S — Situation.** Résilience des erreurs protocole : compatibilité E_RATE avec les pairs antérieurs, E_RATE réessayable (outbox, libération du financement D27 hors refus initial déjà couvert en T3.1c), durabilité des révocations en attente après crash avant usage multi-organisation sensible, casse du dropId sur tous les messages, quota sortant consommé par les refus, réponse explicite à un drop_request rejeté par le schéma (UUIDv4), panne anti…

**T — Tâche.** Contrat : `protocol`, `node`, `requester-mcp`, `a2a`. Change : `t3-1d-protocol-error-resilience` (change à localiser/créer). Dépend de : T3.1b.

**A — Action suivante.** Suivre #104 (alerte propriétaire) puis #105 (inspection au démarrage), ensuite traiter révocations et quotas par sous-tranches.

**R — Résultat et preuve.** PR #104 et #105 fusionnées avec CodeQL, test-macos, test-windows et merge_group ; tests replay/security verts. **État : DOING dans l’index ; aucun succès nouveau revendiqué dans ce registre.**

**Sortie de boucle.** Tests ciblés → lint/typage → OpenSpec guard → revue sécurité si nécessaire → PR/CI sur les OS requis → archive OpenSpec et mise à jour de `docs/TASKS.md`. Pas d’installation physique nécessaire pour le prochain sous-traitement logiciel.

### T3.1e — doing · préqualification autorisée

**S — Situation.** Optimiser et renforcer le stockage anti-rejeu avant pilote : quota de marqueurs par pair, coût par demande (index fiable, durabilité), récupération sûre après perte d'état ou crash sans reprendre un verrou encore actif, fsync de dossier compatible Windows (fait en T3.7 : Windows refuse de vider un dossier, seul cet appel y est sauté ; reste à rendre le renommage durable avant le retour de l'admission en cas de coupure de cour…

**T — Tâche.** Contrat : `node`. Change : `t3-1e-replay-store-operations` (change à localiser/créer). Dépend de : T3.1b, T3.1c.

**A — Action suivante.** Auditer les quotas de marqueurs/pair, compactage et opérations de stockage anti-rejeu sans rouvrir une admission passée.

**R — Résultat et preuve.** Tests de saturation, redémarrage/crash, quotas et intégrité durable en CI. **État : DOING dans l’index ; aucun succès nouveau revendiqué dans ce registre.**

**Sortie de boucle.** Tests ciblés → lint/typage → OpenSpec guard → revue sécurité si nécessaire → PR/CI sur les OS requis → archive OpenSpec et mise à jour de `docs/TASKS.md`. Pas d’installation physique nécessaire pour le prochain sous-traitement logiciel.

### T4.42 — doing · préqualification autorisée

**S — Situation.** Restes durcissement de T4.26 (12 octobre 2026) : la lecture de configuration de l'onboarding ouvre sans O_NONBLOCK (un tube nommé la bloque) ; les écritures du banc de simulation suivent un lien symbolique posé dans un dossier de travail partagé ; démarrage du banc lent sous charge (nœuds Node lancés l'un après l'autre, environ 90 % de l'attente mesurée en T4.25)

**T — Tâche.** Contrat : `node`, `capabilities`, `simulation`. Change : [`t4-42-hardening-leftovers`](../../openspec/changes/archive/2026-10-12-t4-42-hardening-leftovers/). Dépend de : T4.26, T4.25.

**A — Action suivante.** Fermer les reliquats de durcissement de configuration identifiés en revue, sans accès secret ni relaxation du profil privé.

**R — Résultat et preuve.** Tests d’origine réseau, permissions, lectures de fichiers, erreurs négatives et rapport CSO. **État : DOING dans l’index ; aucun succès nouveau revendiqué dans ce registre.**

**Sortie de boucle.** Tests ciblés → lint/typage → OpenSpec guard → revue sécurité si nécessaire → PR/CI sur les OS requis → archive OpenSpec et mise à jour de `docs/TASKS.md`. Pas d’installation physique nécessaire pour le prochain sous-traitement logiciel.

### T4.43 — todo · préqualification autorisée

**S — Situation.** Chemin de livraison de chaque message (réseau local, iroh ou relais) consigné en métadonnées, sans contenu, pour mesurer H5 au lieu de l'estimer par les journaux du relais (protocole T4.6b). Selon la réponse de Guillaume à la question 3 de T4.6b, à remonter avant l'essai

**T — Tâche.** Contrat : `node`. Change : `t4-43-delivery-path-metrics` (change à localiser/créer). Dépend de : T4.6b.

**A — Action suivante.** Rendre visible le chemin LAN/iroh/relais effectivement utilisé et ses transitions sans tracer données privées.

**R — Résultat et preuve.** Tests de chemins préférés, bascule réseau, stabilité des métadonnées et aucune affirmation de liaison non vérifiée. **État : TODO dans l’index ; aucun succès nouveau revendiqué dans ce registre.**

**Sortie de boucle.** Tests ciblés → lint/typage → OpenSpec guard → revue sécurité si nécessaire → PR/CI sur les OS requis → archive OpenSpec et mise à jour de `docs/TASKS.md`. Pas d’installation physique nécessaire pour le prochain sous-traitement logiciel.

### T3.5 — todo · attend dépendances

**S — Situation.** Preuve privée d'ensemble MCP/A2A avec Internet bloqué, chemins d'échec et recette deux confirmations ; remplacer la preuve publique T1.14 pour cette cible

**T — Tâche.** Contrat : `node`, `runner`, `a2a`, `requester-mcp`, `owner-app`, `deploy-mac-vps`. Change : `t3-5-private-system-proof` (change à localiser/créer). Dépend de : T3.1b, T3.1c, T3.1d, T3.2, T3.4, T3.4a.

**A — Action suivante.** Assembler les preuves privées MCP/A2A après clôture des dépendances et interdire tout repli Internet inattendu.

**R — Résultat et preuve.** Démonstration de bout en bout, refus, absence de fuite, tests des deux confirmations et compte rendu. **État : TODO dans l’index ; aucun succès nouveau revendiqué dans ce registre.**

**Sortie de boucle.** Tests ciblés → lint/typage → OpenSpec guard → revue sécurité si nécessaire → PR/CI sur les OS requis → archive OpenSpec et mise à jour de `docs/TASKS.md`. Pas d’installation physique nécessaire pour le prochain sous-traitement logiciel.

### T4.20 — todo · préqualification autorisée

**S — Situation.** Dette de traçabilité trouvée par l'audit T4.19 : relier par marqueur les scénarios déjà testés (144 en baseline), tester les délais de reconnexion (node/spec.md « Délais bornés »), trancher l'exigence de couverture à 100 % de protocol, synchroniser AC-MAC-01 à 04 dans owner-app, requalifier les specs gateway et deploy-mac-vps

**T — Tâche.** Contrat : `node`, `protocol`, `owner-app`, `gateway`, `deploy-mac-vps`, `blocked-observer`, capacités. Change : `t4-20-spec-traceability` (change à localiser/créer). Dépend de : T4.19.

**A — Action suivante.** Relier chaque scénario OpenSpec existant à un test réel avec sélecteur exact, sans effacer les critères non couverts.

**R — Résultat et preuve.** openspec-guard vérifié, couverture accrue, baseline uniquement réduite et pas de fausse liaison. **État : TODO dans l’index ; aucun succès nouveau revendiqué dans ce registre.**

**Sortie de boucle.** Tests ciblés → lint/typage → OpenSpec guard → revue sécurité si nécessaire → PR/CI sur les OS requis → archive OpenSpec et mise à jour de `docs/TASKS.md`. Pas d’installation physique nécessaire pour le prochain sous-traitement logiciel.

### T4.21 — todo · préqualification autorisée

**S — Situation.** Lisibilité du code, reste de l'audit T4.19 : découper NodeEngine (1 800 lignes, six rôles) par responsabilité, sortir le script du panneau (900 lignes dans une chaîne, hors lint et typecheck) dans un fichier typé, extraire la poignée de main LAN (lan.ts), un seul écouteur pour le flux SSE /ui/events, outil de signature de politique pour l'organisation (signPolicy sans appelant), transitions d'état appliquées à l'exécution (ca…

**T — Tâche.** Contrat : `node`, `owner-app`, `protocol`, `monorepo-tooling`. Change : `t4-21-code-readability` (change à localiser/créer). Dépend de : T4.19.

**A — Action suivante.** Découper NodeEngine par responsabilité en petites tranches, API inchangée et tests de non-régression à chaque extraction.

**R — Résultat et preuve.** Tests protocole/Node complets, perf stable, interface publique inchangée et revue sécurité. **État : TODO dans l’index ; aucun succès nouveau revendiqué dans ce registre.**

**Sortie de boucle.** Tests ciblés → lint/typage → OpenSpec guard → revue sécurité si nécessaire → PR/CI sur les OS requis → archive OpenSpec et mise à jour de `docs/TASKS.md`. Pas d’installation physique nécessaire pour le prochain sous-traitement logiciel.

### T4.27 — todo · attend dépendances

**S — Situation.** Liste publique des hôtes contactés en sortie, trouvé le 12 octobre 2026 en lisant OpenWhispr (docs/network-allowlist.md, commit 5f9a88b) : chaque hôte, protocole et port que le Node, la coque Tauri et drop-iroh peuvent joindre, classé par condition (profil privé par défaut, relais choisi, relais iroh, fournisseur de modèle choisi par le propriétaire, mise à jour) ; un test relie la liste aux hôtes présents dans le code pour q…

**T — Tâche.** Contrat : `product-foundation`, `node`, `owner-app`. Change : `t4-27-network-allowlist` (change à localiser/créer). Dépend de : T3.4.

**A — Action suivante.** Rassembler les destinations sortantes réseau réelles puis publier une allowlist transparente et vérifiable.

**R — Résultat et preuve.** Inventaire du code, tests DNS/HTTP et documentation exacte des exceptions sans secret. **État : TODO dans l’index ; aucun succès nouveau revendiqué dans ce registre.**

**Sortie de boucle.** Tests ciblés → lint/typage → OpenSpec guard → revue sécurité si nécessaire → PR/CI sur les OS requis → archive OpenSpec et mise à jour de `docs/TASKS.md`. Pas d’installation physique nécessaire pour le prochain sous-traitement logiciel.

### T4.29 — todo · attend dépendances

**S — Situation.** Canari hebdomadaire des fournisseurs de modèle, hors CI de PR, trouvé le 12 octobre 2026 en lisant OpenWhispr (.github/workflows/llm-canary.yml, commit 5f9a88b) : un workflow planifié envoie à chaque fournisseur compatible OpenAI pris en charge la requête exacte du runner (paramètres, outils, format de sortie) et ouvre ou met à jour une issue en cas d'échec ; les clés de test sont des secrets du dépôt créés par Guillaume ; tr…

**T — Tâche.** Contrat : `runner`, `monorepo-tooling`. Change : `t4-29-provider-canary` (change à localiser/créer). Dépend de : T3.2.

**A — Action suivante.** Construire un canari indépendant de la CI PR pour les fournisseurs de modèle, sans appeler un service non autorisé.

**R — Résultat et preuve.** Alertes sur dérives et erreurs, budget borné et historique ne contenant aucun prompt privé. **État : TODO dans l’index ; aucun succès nouveau revendiqué dans ce registre.**

**Sortie de boucle.** Tests ciblés → lint/typage → OpenSpec guard → revue sécurité si nécessaire → PR/CI sur les OS requis → archive OpenSpec et mise à jour de `docs/TASKS.md`. Pas d’installation physique nécessaire pour le prochain sous-traitement logiciel.

### T3.6 — todo · attend dépendances

**S — Situation.** Préparation de publication : audit historique/artefacts/licences/CI, signalement privé opérationnel, clone propre, docs adaptateurs, noms et paquets ; reprend les gates T2.11 et T2.6. Toute publication attend l'accord humain

**T — Tâche.** Contrat : `product-foundation`, `monorepo-tooling`, `owner-app`, `site`. Change : `t3-6-oss-release-readiness` (change à localiser/créer). Dépend de : T3.5.

**A — Action suivante.** Auditer licences, historique, signatures, distribution et voie privée de signalement avant toute publication.

**R — Résultat et preuve.** Checklist de publication, SBOM/licences, checks de signature et accord explicite du propriétaire. **État : TODO dans l’index ; aucun succès nouveau revendiqué dans ce registre.**

**Sortie de boucle.** Tests ciblés → lint/typage → OpenSpec guard → revue sécurité si nécessaire → PR/CI sur les OS requis → archive OpenSpec et mise à jour de `docs/TASKS.md`. Décision ou témoignage humain indispensable.

### T4.13 — todo · attend dépendances

**S — Situation.** P5 : revue concurrentielle refaite, nom du produit, offre et lancement public ; toute publication attend l'accord humain

**T — Tâche.** Contrat : `site`, `product-foundation`. Change : `t4-13-launch` (change à localiser/créer). Dépend de : T4.6, T3.6.

**A — Action suivante.** Reporter le lancement ; consolider positionnement, nom et pricing après vraie validation des binômes.

**R — Résultat et preuve.** Verdict utilisateur, décision explicite de commercialisation et validation des messages publics. **État : TODO dans l’index ; aucun succès nouveau revendiqué dans ce registre.**

**Sortie de boucle.** Tests ciblés → lint/typage → OpenSpec guard → revue sécurité si nécessaire → PR/CI sur les OS requis → archive OpenSpec et mise à jour de `docs/TASKS.md`. Décision ou témoignage humain indispensable.

### T3.1a — todo · attend dépendances

**S — Situation.** Évaluer Hermes Agent comme demandeur via MCP stdio : raccordement manuel isolé, consentement/résultat/refus, modèle local ou interne explicite, aucun accès élargi ; conclure sur un éventuel adaptateur de détection

**T — Tâche.** Contrat : `requester-mcp`, `node`. Change : [`t3-1a-hermes-mcp-evaluation`](../../openspec/changes/t3-1a-hermes-mcp-evaluation/). Dépend de : T3.1b, T4.6.

**A — Action suivante.** Évaluer Hermes comme client MCP isolé après l’essai, sans partager davantage que la réponse autorisée.

**R — Résultat et preuve.** Scénarios consentement, permissions, secrets et débit ; GO/NO-GO documenté. **État : TODO dans l’index ; aucun succès nouveau revendiqué dans ce registre.**

**Sortie de boucle.** Tests ciblés → lint/typage → OpenSpec guard → revue sécurité si nécessaire → PR/CI sur les OS requis → archive OpenSpec et mise à jour de `docs/TASKS.md`. Pas d’installation physique nécessaire pour le prochain sous-traitement logiciel.

### T3.2a — todo · attend dépendances

**S — Situation.** Évaluer AI SDK en adaptateurs TypeScript directs et LiteLLM comme passerelle interne facultative : matrice fournisseurs/outils, erreurs, budgets, secrets, trafic, licences et packaging ; décision motivée avant toute adoption

**T — Tâche.** Contrat : `runner`, `capability-repo-answer`, `capability-mcp-answer`. Change : `t3-2a-provider-adapter-evaluation` (change à localiser/créer). Dépend de : T3.5, T4.6.

**A — Action suivante.** Comparer AI SDK et LiteLLM en adaptateurs facultatifs une fois les modèles et cas d’usage validés.

**R — Résultat et preuve.** Banc de qualité/latence/coût et compatibilité avec le profil privé et le protocole. **État : TODO dans l’index ; aucun succès nouveau revendiqué dans ce registre.**

**Sortie de boucle.** Tests ciblés → lint/typage → OpenSpec guard → revue sécurité si nécessaire → PR/CI sur les OS requis → archive OpenSpec et mise à jour de `docs/TASKS.md`. Pas d’installation physique nécessaire pour le prochain sous-traitement logiciel.

### T4.7 — todo · attend dépendances

**S — Situation.** P2 : simulation complète (500 nœuds virtuels, 10 à 20 personnages sur modèles gratuits, carte interactive, traces, boucle d'amélioration bornée)

**T — Tâche.** Contrat : `simulation`. Change : `t4-7-simulation-full` (change à localiser/créer). Dépend de : T4.1, T4.6.

**A — Action suivante.** Étendre la simulation aux 500 nœuds seulement après les retours du pilote, avec limites CPU/mémoire.

**R — Résultat et preuve.** Scénarios déterministes, stabilité du relais, mémoire bornée et rapport horodaté. **État : TODO dans l’index ; aucun succès nouveau revendiqué dans ce registre.**

**Sortie de boucle.** Tests ciblés → lint/typage → OpenSpec guard → revue sécurité si nécessaire → PR/CI sur les OS requis → archive OpenSpec et mise à jour de `docs/TASKS.md`. Pas d’installation physique nécessaire pour le prochain sous-traitement logiciel.

### T4.8 — todo · attend dépendances

**S — Situation.** P3 : agent inclus qui répond pour le propriétaire après accord, modèle choisi par lui

**T — Tâche.** Contrat : `runner`, `owner-app`, `node`. Change : `t4-8-built-in-agent` (change à localiser/créer). Dépend de : T4.3, T3.2, T4.6.

**A — Action suivante.** Créer un agent intégré uniquement avec outils définis avant modèle et approbation explicite du propriétaire.

**R — Résultat et preuve.** Tests d’autorisation, refus, schémas de sortie et scanner de secrets. **État : TODO dans l’index ; aucun succès nouveau revendiqué dans ce registre.**

**Sortie de boucle.** Tests ciblés → lint/typage → OpenSpec guard → revue sécurité si nécessaire → PR/CI sur les OS requis → archive OpenSpec et mise à jour de `docs/TASKS.md`. Pas d’installation physique nécessaire pour le prochain sous-traitement logiciel.

### T4.9 — todo · attend dépendances

**S — Situation.** P3 : petite question (niveau 2) sur un contexte déclaré, appel neuf sans outil

**T — Tâche.** Contrat : `runner`, `node`, `protocol`. Change : `t4-9-declared-context-question` (change à localiser/créer). Dépend de : T4.4, T4.6.

**A — Action suivante.** Borner la question sur contexte déclaré à une seule session sans accès à des outils non autorisés.

**R — Résultat et preuve.** AC de contexte, expiration, validation de réponse et consentement. **État : TODO dans l’index ; aucun succès nouveau revendiqué dans ce registre.**

**Sortie de boucle.** Tests ciblés → lint/typage → OpenSpec guard → revue sécurité si nécessaire → PR/CI sur les OS requis → archive OpenSpec et mise à jour de `docs/TASKS.md`. Pas d’installation physique nécessaire pour le prochain sous-traitement logiciel.

### T4.10b — todo · attend dépendances

**S — Situation.** Relais d'entreprise en binaire autonome : exécutable unique Node (SEA, CommonJS, postject à ajouter avec sa décision), Linux x64 et arm64 puis macOS, signature et empreintes

**T — Tâche.** Contrat : `relay`, `deploy-mac-vps`. Change : `t4-10b-relay-binary` (change à localiser/créer). Dépend de : T4.10, T4.6.

**A — Action suivante.** Évaluer un binaire de relais autoportant avec isolation secrets et exploitation hors Docker.

**R — Résultat et preuve.** Build reproducible, démarrage/restauration, réseau et logs sans données privées. **État : TODO dans l’index ; aucun succès nouveau revendiqué dans ce registre.**

**Sortie de boucle.** Tests ciblés → lint/typage → OpenSpec guard → revue sécurité si nécessaire → PR/CI sur les OS requis → archive OpenSpec et mise à jour de `docs/TASKS.md`. Pas d’installation physique nécessaire pour le prochain sous-traitement logiciel.

### T4.10c — todo · attend dépendances

**S — Situation.** Pack entreprise, exploitation : rechargement du certificat TLS et de la politique sans redémarrage, garde du modèle prouvée de bout en bout par le daemon (Helm dans la CI : fait, PR #25)

**T — Tâche.** Contrat : `relay`, `node`, `deploy-mac-vps`. Change : `t4-10c-enterprise-ops` (change à localiser/créer). Dépend de : T4.10, T4.6.

**A — Action suivante.** Fiabiliser l’exploitation entreprise : rechargement TLS/politique, suivi d’état et arrêt sans perte.

**R — Résultat et preuve.** Tests rotation, rollback, reprise après crash et respect des politiques signées. **État : TODO dans l’index ; aucun succès nouveau revendiqué dans ce registre.**

**Sortie de boucle.** Tests ciblés → lint/typage → OpenSpec guard → revue sécurité si nécessaire → PR/CI sur les OS requis → archive OpenSpec et mise à jour de `docs/TASKS.md`. Pas d’installation physique nécessaire pour le prochain sous-traitement logiciel.

### T4.11 — todo · attend dépendances

**S — Situation.** P4 : tâches déléguées (niveau 4) sur Task A2A avec jalons d'approbation

**T — Tâche.** Contrat : `a2a`, `runner`, `node`, `owner-app`. Change : `t4-11-delegated-tasks` (change à localiser/créer). Dépend de : T4.9, T4.6.

**A — Action suivante.** Découper la délégation A2A en jalons exigeant un accord, sans donner accès au contexte brut.

**R — Résultat et preuve.** Tests d’autorisations par étape, annulation, expiration et traçabilité. **État : TODO dans l’index ; aucun succès nouveau revendiqué dans ce registre.**

**Sortie de boucle.** Tests ciblés → lint/typage → OpenSpec guard → revue sécurité si nécessaire → PR/CI sur les OS requis → archive OpenSpec et mise à jour de `docs/TASKS.md`. Pas d’installation physique nécessaire pour le prochain sous-traitement logiciel.

### T4.12 — todo · attend dépendances

**S — Situation.** P4 : contexte partagé décentralisé (catalogue de sujets, boîte de suggestions, invalidation)

**T — Tâche.** Contrat : `node`, `protocol`, `owner-app`. Change : `t4-12-decentralized-context` (change à localiser/créer). Dépend de : T4.4, T4.9, T4.6.

**A — Action suivante.** Définir un catalogue de sujets décentralisé avec droits, invalidation et suggestions non exécutables.

**R — Résultat et preuve.** Tests de confidentialité, invalidation, révocation et stabilité des métadonnées. **État : TODO dans l’index ; aucun succès nouveau revendiqué dans ce registre.**

**Sortie de boucle.** Tests ciblés → lint/typage → OpenSpec guard → revue sécurité si nécessaire → PR/CI sur les OS requis → archive OpenSpec et mise à jour de `docs/TASKS.md`. Pas d’installation physique nécessaire pour le prochain sous-traitement logiciel.

## Archives et éléments non exécutables

**done (70) :** T4.19, T3.1b, T3.1c, T4.15, T4.22, T4.6a, T4.23, T4.33, T4.25, T4.26, T4.34, T4.32, T4.6b, T3.1f, T3.0, T3.0a, T3.1, T3.3, T3.4a, T4.0, T4.0a, T4.1, T4.2, T4.2c, T4.2b, T4.2d, T4.2e, T4.3, T4.4, T4.5, T4.10, T4.14, T4.17, T4.18, T0.0, T0.1, T0.2, T0.3, T0.4, T0.5, T0.6, T1.1, T1.2, T1.3, T1.4, T1.5, T1.6, T1.7, T1.8, T1.9, T1.10, T1.11, T1.12, T1.13, T2.1, T2.2, T2.3, T2.5, T2.12, T2.14, T2.15, T2.8, T2.9, T2.10, T2.16, T2.17, T2.18, T2.19, T2.6a, T2.6b.

**deferred (2) :** T2.13, T2.20.

**superseded (5) :** T1.14, T2.4, T2.11, T2.6, T2.7.

## Relais GitHub actifs (état à vérifier au moment du cycle)

- [PR #104](https://github.com/memolabs-dev/drop/pull/104) : signal propriétaire, merge queue et CI doivent être vérifiés avant la conclusion.
- [PR #105](https://github.com/memolabs-dev/drop/pull/105) : détection anti-rejeu au démarrage, actuellement dépendante de #104 ; ne pas fusionner en sautant la base.
- [PR #99](https://github.com/memolabs-dev/drop/pull/99) : optimisation CI fusionnée ; l’index `T4.28` doit être réconcilié avec les AC, sans supposer que toutes les demandes sont terminées.

Chaque nouvelle boucle consigne les liens réels des PR, SHA, checks et tests dans son handoff, **pas** dans le statut canonique tant que les critères ne sont pas satisfaits.
