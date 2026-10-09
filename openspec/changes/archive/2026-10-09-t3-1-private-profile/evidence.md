# Preuves T3.1 — 9 octobre 2026

Périmètre : runtime privé, AC-PRIVATE-01 à 08 ; pas la distribution signée, les vrais modèles ou le raccordement groupé. Base avant change : `5b9b178`. Les exigences normatives sont dans les huit specs synchronisées ; les critères produits sont dans `docs/ACCEPTANCE.md`.

## Vérification exécutée

| ID | Commande / méthode | Résultat |
| --- | --- | --- |
| EV-01 | `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r test` | PASS : 262 tests, 33 fichiers ; aucune erreur lint/types. Typecheck rejoué sans réécriture RTK. |
| EV-02 | `openspec validate --all --strict` | PASS : 16 specs + la change |
| EV-03 | openspec-guard 0.3.0, require-selector, fail-on fail, puis update-baseline | PASS : 365 critères, 88 liés, 19 déclarés non testables, 258 hérités gelés ; baseline +0/-1. Trois titres dynamiques hérités restent invisibles au matching. Ce contrôle ne prouve pas la couverture des 258 hérités. |
| EV-04 | `node scripts/bundle.ts` ; relais assemblé lancé avec config temporaire | PASS : trois bundles ; health `{ok:true,nodes:0}`, arrêt SIGTERM code 0 ; test private-bundle initialise un home vierge avec le vrai CLI assemblé. |
| EV-05 | `cargo test --offline` dans apps/mac/src-tauri | PASS : compilation du shell, 1 test du bootstrap local/configuré. Ni signature ni essai Mac propre. |
| EV-06 | recette `docs/PRIVATE_PROFILE.md`, Docker `--network none` | PASS : sept scénarios, cinq appels au modèle factice ; données détaillées dans evidence/. |
| EV-07 | `pnpm site:build`, tests test/site.test.ts | PASS : 15 fichiers exportés, 3 tests ; liens locaux, confinement de l’aperçu et docs téléchargeables. |
| EV-08 | revue indépendante native /review et /cso gstack | Aucun P1/P2 résiduel établi ; détails et limites ci-dessous. |
| EV-09 | test private-tls ; `bash -n scripts/demo-local.sh scripts/private-proof/run.sh` ; `git diff --check` | PASS : confiance TLS vérifiée et refus sans CA ; scripts valides, aucun défaut whitespace. |

Environnement : Node 24.21.0, pnpm 11.27.0, OpenSSL hôte 3.6.5. Conteneur : Node 24.21.0, tcpdump 4.99.3, libpcap 1.10.3. Image locale `sha256:c619b3647a39ce3bb88b94eca36397b98f4e2ff2247693bf5abed709ce300ac4` ; bundle exécuté `/proof/proof.mjs`, SHA-256 `18776b4a2655b2e84e62b242b396b8f0d6cd4c4787e9edb40fd39b33d82e5ac1`. L’image prépare ses outils avant isolation ; l’usage isolé n’installe rien.

## Traçabilité des critères

| Critère | Preuve et portée |
| --- | --- |
| AC-PRIVATE-01 | EV-06 + private-config/private-bundle : identités neuves, relais loopback, invitation, aucun compte ni clé cloud. |
| AC-PRIVATE-02 | EV-06 : vrai relais, deux vrais daemons, fixture MCP HTTP et fixture modèle ; consentement, outils, relecture puis résultat. |
| AC-PRIVATE-03 | private-network/private-adapters : public, DNS, IP ambiguës, origine absente, redirection et interface A2A secondaire refusées avant transmission ; stdio refusé avant lancement. Politique de l’hôte et limitations explicites dans PRIVATE_PROFILE. |
| AC-PRIVATE-04 | private-network/private-adapters/funding : fournisseur/modèle du propriétaire préservés, clé incompatible refusée avant réseau ; financement non sollicité refusé avant consentement. |
| AC-PRIVATE-05 | EV-06 + private-replay : panne modèle visible, déconnexion/reprise relais, redémarrage des Nodes, ancienne demande refusée, nouvel accord nécessaire. |
| AC-PRIVATE-06 | EV-06 : observation du démarrage, usage, arrêt et relance ; aucune route externe, aucun paquet non-loopback, aucun appel d’activation/télémétrie/download dans ce parcours. |
| AC-PRIVATE-07 | private-config : config sauvegardée en 0600, identité et publication identiques, retour arrière exact, interruption avant remplacement et verrou occupé, conflit refusé. Inspection : seul config.json est remplacé ; token/pairs et autres fichiers non touchés. Migration hors ligne, aucun éditeur concurrent. |
| AC-PRIVATE-08 | EV-06 + relay tests : admission persistante, révocation persistante après copie/restauration config+admissions, refus de nouveaux tickets et de parrainage par le membre révoqué ; guide opérateur et diagnostic expurgé. |

Reprise T2.1 : tests relay « admits a newcomer…once, and remembers it » et « refuses tickets…forged tickets…over quota » ; protocole « signs single-use admission tickets… » couvre signature, expiration et falsification. Les nouvelles preuves de révocation/restauration complètent cette reprise. Aucun ancien déploiement n’est recertifié.

## Capture sans Internet

`evidence/network.txt` : 510 lignes de paquets, chacune de `127.0.0.1` à `127.0.0.1`, aucune requête DNS. Capture `tcpdump -i any` TCP/UDP, métadonnées imprimées uniquement, aucun payload conservé. Seule la ligne vide finale de la sortie tcpdump a été retirée avant archivage. `capture.txt` indique 510 capturés et **0 perdus par le noyau**. `interfaces.json` montre loopback actif et interfaces tunnel inactives ; `routes.json` est vide. `egress.json` rapporte `ENETUNREACH` pour une sonde TCP vers l’adresse documentaire 192.0.2.1. `result.json` conserve les noms des sept scénarios et les méthodes/chemins de fixture, jamais une vraie question, clé ou réponse.

Cette preuve porte sur l’espace réseau de ce conteneur et ces fixtures. Elle ne mesure pas les connexions propres d’un serveur MCP/A2A tiers installé chez un client, ni un vrai modèle. Les services internes doivent être isolés par l’opérateur. Les captures de démarrage d’un Mac signé et le parcours deux confirmations relèvent de T3.4/T3.5.

## Revue indépendante et corrections

La revue a trouvé un P1 : une réponse HTTP 600 provoquait une exception hors Promise. Correction : rejet stable E_RUNNER avant construction de Response. Régression private-network, reproduction native indépendante (processus vivant, HTTP 200 préservé). Le bundle système a aussi révélé le démarrage automatique du point d’entrée requester-mcp importé : exports bibliothèque séparés de l’exécutable, vérifiés par private-bundle et EV-06. Validation provider déplacée avant la découverte MCP.

Le vérificateur `/root/sovereign_landing` a relu les frontières, le financement, la migration, la révocation, le rejeu et les dernières corrections ; dernier verdict **NO FINDINGS, aucun P1/P2 résiduel sur le périmètre examiné**, 15 tests ciblés dans quatre fichiers sur la dernière passe. Les preuves réseau et les corrections du guide/landing ont été relues indépendamment.

CSO automatique : audit `/Users/memo/.gstack/security/cso/d655ad1e7112ef0f4867ba0f/1791545464452-dc42856a5de35633/report.md`, recheck `/Users/memo/.gstack/security/cso/d655ad1e7112ef0f4867ba0f/1791545849019-2b771c99a3fb1d2d/report.md`. **Couverture partielle**, avec 16 gaps (icônes, anciennes captures, deux specs runner). Finding historique `4dd1520dbea3e2d3c1f54bc1618571ea` non formellement clos par CSO, même si sa correction technique est prouvée nativement. Le skill CSO interdit de clore un ancien finding par audit partiel ; cette règle est conservée. La revue externe est indisponible sous Codex ; aucun CLI d’agent imbriqué n’a été lancé. Ne pas annoncer un audit complet ou une certification.
