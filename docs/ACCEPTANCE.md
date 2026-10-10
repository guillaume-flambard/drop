# Critères du produit privé à construire

Conception adoptée le 9 octobre 2026. **T3.1 dispose de preuves exécutables pour AC-PRIVATE-01 à 08**, avec fixtures et limites décrites dans [PRIVATE_PROFILE](PRIVATE_PROFILE.md). Les autres critères restent à implémenter ou à revérifier dans leur chantier. T3.0 vérifie le plan, pas ces comportements. Avant de coder, promouvoir les critères dans les specs normatives concernées et les lier aux tests ou à une recette matérielle. Ordre et dépendances : [TASKS](TASKS.md).

## Profil privé : T3.1

[Preuves AC-PRIVATE-01 à 08](../openspec/changes/archive/2026-10-09-t3-1-private-profile/evidence.md) et [acceptation manuelle](../openspec/changes/archive/2026-10-09-t3-1-private-profile/closure.md).

| Critère       | Situation et résultat exigé                                                                        | Preuve attendue                                                                                  |
| ------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| AC-PRIVATE-01 | Installation vierge avec relais interne, sans compte Memo Labs ni clé cloud                        | Intégration avec deux Nodes                                                                      |
| AC-PRIVATE-02 | Internet bloqué, sources et modèle internes disponibles : consentement et réponse fonctionnent     | Capture réseau et E2E reproductible, interfaces surveillées précisées                            |
| AC-PRIVATE-03 | Destination modèle/MCP/A2A hors politique, même par redirection ou résolution : refus avant envoi  | Tests d'adresses, DNS, redirections et destinations secondaires ; politique de l'hôte documentée |
| AC-PRIVATE-04 | Financement distant proposé : endpoint du propriétaire inchangé                                    | Non-substitution, refus du financement incompatible, aucune clé divulguée                        |
| AC-PRIVATE-05 | Modèle ou relais indisponible : erreur visible, aucun repli cloud                                  | Panne, redémarrage, reprise sans doublon ni consentement réutilisé                               |
| AC-PRIVATE-06 | Télémétrie, activation de licence, mises à jour et téléchargement désactivés : usage complet       | Capture démarrage, usage, arrêt et relance                                                       |
| AC-PRIVATE-07 | Ancienne config lab : migration explicite, identité et capacités préservées                        | Sauvegarde, migration et retour arrière                                                          |
| AC-PRIVATE-08 | Installation interne petite équipe : admission, révocation, sauvegarde et restauration accessibles | Recette VM/conteneur propre, diagnostic expurgé                                                  |

## Modèles : T3.2

| Critère     | Situation et résultat exigé                                                     | Preuve attendue                                                                        |
| ----------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| AC-MODEL-01 | Capacité déterministe ou agent A2A existant : aucun modèle drop requis          | Test sans Ollama ni clé modèle                                                         |
| AC-MODEL-02 | Modèle absent : choix avec licence/volume, annulation sans bloquer l'app        | Recette UI, annulation, disque insuffisant                                             |
| AC-MODEL-03 | 4B/9B comparés sur corpus commun                                                | Rapport versions/matériel/qualité/mémoire/latence ; aucun défaut d'autorisation toléré |
| AC-MODEL-04 | Source hostile ou modèle non coopératif : outils fixes, sortie invalide rejetée | Tests adversariaux, décision indépendante du LLM                                       |

## Connexion locale : T3.3

| Critère       | Situation et résultat exigé                                                       | Preuve attendue                                                                 |
| ------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| AC-CONNECT-01 | Quatre agents valides : analyse sans exécution MCP, scan global ou réseau         | Fixtures par adaptateur, observation processus/réseau ; aucune valeur de secret |
| AC-CONNECT-02 | Confirmation : seules les entrées annoncées changent, aucun outil publié          | Diff avant/après et catalogue inchangé                                          |
| AC-CONNECT-03 | Répétition sans doublon ; entrée différente : conflit visible                     | Idempotence, portées et collisions                                              |
| AC-CONNECT-04 | Config invalide, CLI absente ou accès refusé : erreur par agent, aucun écrasement | Tests négatifs et reprise ciblée                                                |
| AC-CONNECT-05 | Changement concurrent ou arrêt pendant écriture : contenu tiers préservé          | Interruptions, transactions/compensations et sauvegardes privées                |
| AC-CONNECT-06 | Déconnexion après ajouts tiers : retirer seulement drop                           | Restauration sélective, rétention bornée                                        |
| AC-CONNECT-07 | Relance d'agent nécessaire ou équipe hors ligne : états distincts                 | Tests sans succès global trompeur                                               |
| AC-CONNECT-08 | Aucun agent ou agent inconnu : voie manuelle, pas de permission large             | Recette état vide et non pris en charge                                         |

## Application Mac : T3.4

| Critère   | Situation et résultat exigé                                                   | Preuve attendue                                                             |
| --------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| AC-MAC-01 | Mac propre sans Node développeur : installation et consentement fonctionnent  | Paquet signé/notarisé installé ; versions et architectures testées publiées |
| AC-MAC-02 | Clavier et VoiceOver : sélection, accord, refus et annulation accessibles     | Recette focus et libellés                                                   |
| AC-MAC-03 | Veille, panne du sidecar, port occupé : récupération bornée                   | Cycle de vie sans double daemon ni écoute publique                          |
| AC-MAC-04 | Mise à jour refusée ou réseau coupé : usage conservé ; paquet invalide rejeté | Signature, provenance, rollback, canal hors ligne                           |

## Preuve d'ensemble : T3.5

| Critère   | Situation et résultat exigé                                                                        | Preuve attendue                                                                                                    |
| --------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| AC-E2E-01 | Deux propriétaires, agents différents, réseau privé : MCP puis A2A                                 | Recette rejouable, captures expurgées, versions compatibles précisées                                              |
| AC-E2E-02 | Refus, report, expiration, replay, sortie invalide, secret, absence et réponse partielle           | Tests système ; aucune livraison indue ni autorisation résiduelle                                                  |
| AC-E2E-03 | Après installation et environnement prêt : deux confirmations suffisent au raccordement compatible | Recette observée ; actions annexes et relances comptées séparément                                                 |
| AC-E2E-04 | Internet indisponible : aucun service externe requis                                               | Matrice des destinations de tous les composants, dont l'agent A2A joint ; pas de promesse universelle de non-fuite |

## Publication et plateformes

| Critère     | Responsable | Résultat et preuve attendus                                                                                                           |
| ----------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| AC-OSS-01   | T3.6        | Historique, fixtures, artefacts et captures relus ; secrets et données tierces retirés, dépendances/poids et attributions inventoriés |
| AC-OSS-02   | T3.6        | CI publique sans lab ni secrets, signalement privé testé, provenance des paquets documentée ; accord avant publication                |
| AC-OSS-03   | T3.6        | Clone propre : tests sans compte, exemple borné, documentation d'adaptateur, aucun faux binaire public                                |
| AC-WIN-01   | T3.7        | Tray, WebView2, chemins, signature et corpus commun vérifiés sur Windows ; versions supportées publiées                               |
| AC-LINUX-01 | T3.8        | WebKitGTK, GNOME/KDE, X11/Wayland vérifiés ; panneau accessible sans tray ; corpus commun vert                                        |

Les preuves se construisent chantier par chantier, sans recopier les coches d'une plateforme vers une autre. D24 et l'acceptation humaine restent distincts des tests techniques.

## Évaluations complémentaires, non bloquantes

Ces critères restent à vérifier ; aucune intégration ni adoption de dépendance n’est livrée par cette note. D39 conserve les sources. L’ordre reste dans TASKS.

| Critère        | Responsable | Résultat et preuve attendus                                                                                                                                                                                                                              |
| -------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-HERMES-01   | T3.1a       | Dans un profil de test isolé, Hermes charge le connecteur MCP stdio drop et demande une réponse ; l’accord la livre, le refus et l’expiration ne livrent rien. Versions et configuration expurgée documentées.                                           |
| AC-HERMES-02   | T3.1a       | Modèle explicitement local/interne, destinations observées, aucun service Nous imposé et aucune collecte de mémoire/config personnelle ; panne sans repli distant. Sinon consigner l’écart sans annoncer la compatibilité privée.                        |
| AC-HERMES-03   | T3.1a       | Aucun outil supplémentaire accordé au runner ; aucune détection automatique déclarée livrée. Conclure intégrer/adapter/différer, avec travail restant, coût de maintenance et voie de retrait du raccordement de test.                                   |
| AC-PROVIDER-01 | T3.2a       | Comparer client actuel, AI SDK direct et LiteLLM privé sur un même corpus : texte, outils, schéma invalide, annulation, timeout, authentification et comptage des coûts. Matrice par fournisseur et version, sans promesse de compatibilité universelle. |
| AC-PROVIDER-02 | T3.2a       | Aucun passage obligatoire par Vercel AI Gateway ou autre cloud ; endpoint du propriétaire inchangé, clés expurgées, fallback contrôlé et budget respecté. Observer aussi les destinations de la passerelle choisie.                                      |
| AC-PROVIDER-03 | T3.2a       | Rapport de licence, dépendances, taille/complexité du paquet et coûts API distincts du logiciel gratuit. Décision explicite dans DECISIONS avant tout SDK runtime ; conserver le client actuel si aucun gain ne justifie la migration.                   |
