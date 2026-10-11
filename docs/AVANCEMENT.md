# Où en est drop ?

## 11 octobre 2026

drop est un prototype. Rien n'a encore été validé avec de vrais utilisateurs. Julie et Natha sont des personnages de scénario ; toutes les démonstrations ont tourné sur les machines de Guillaume. Le besoin (D24) n'est pas mesuré.

L'ordre et les statuts font foi dans [TASKS](TASKS.md). Les preuves de chaque tâche sont dans son dossier archivé, sous `openspec/changes/archive/`. Pour vérifier le code : `pnpm -r test` (voir la dernière section).

### Livré

- **Profil privé (T3.1).** Créé par `drop init` et par l'app : relais interne, destinations réseau explicites, aucun repli cloud. Le propriétaire paie son propre modèle ; une clé reçue est refusée avant le consentement. Le financement par le demandeur n'existe que dans le profil historique. Voir [le profil privé](PRIVATE_PROFILE.md).
- **Raccordement des agents (T3.3, T4.5).** Treize clients MCP détectés ; sept raccordés automatiquement (Claude Code, Claude Desktop, Cursor, Codex, Gemini CLI, VS Code, Cline), six par une configuration à copier. Voir [ONBOARDING](ONBOARDING.md).
- **Connexion (T4.2, T4.2b à T4.2e).** Réseau local par mDNS. Internet par iroh, un programme Rust séparé, désactivé par défaut : entre deux réseaux, il faut un relais choisi (le sien ou celui de l'équipe), jamais un relais imposé. Plus les corrections issues des revues (T4.2c à T4.2e).
- **Réponse à la main (T4.3)** et **faits publiés, servis sans modèle (T4.4)**.
- **Panneau conforme (T4.14).** Expiration, « Sensibilité haute », « Pas maintenant » par défaut, retrait de champs à la relecture, invitation `drop://pair` confirmée, notifications à l'icône de l'app.
- **Pack entreprise (T4.10).** Politique signée appliquée au poste et au relais, qui peut interdire toute passerelle ; image Docker et chart Helm du relais.
- **Relais.** Révocation sans redémarrage, avec `--with-invited` (T2.19).
- **Divers.** Jeton local vide refusé (T3.4a), propriétaire désigné quand plusieurs pairs publient la même capacité (T4.17), daemon arrêté avec l'app (T4.18), banc de simulation de 50 nœuds (T4.1), documents produit (T4.0, T4.0a).
- **Site.** Publié sur [drop.memolabs.dev](https://drop.memolabs.dev) le 8 octobre (T2.6b). La version en ligne date de ce jour-là ; voir [l'exploitation du lab](deploiement-lab.md).

### En vérification

- **App Mac (T3.4).** Build signée et notarisée pour Apple Silicon, acceptée par Apple le 10 octobre ([preuve](../openspec/changes/t3-4-private-mac-app/proof/verification.md)). Reste à archiver cette preuve, tester la veille et « Réessayer », puis la recette de Guillaume : installation sur un Mac neuf et VoiceOver.
- **Anti-rejeu (T3.1b, T3.1c).** Corrections implémentées et testées ; la revue formelle de T3.1b puis la clôture du constat de sécurité HIGH (T3.1c) restent à faire.
- **Audit du 11 octobre (T4.19).** Revue du code, corrections, documents et site remis en vérité.
- **Recettes humaines.** Les changes archivées en `READY_FOR_MANUAL_ACCEPTANCE` attendent l'acceptation de Guillaume.

### Tout de suite : mesurer le besoin (T0.7)

- 3 à 5 développeurs installent seulement blocked-observer, 10 jours actifs chacun, puis les blocages sont classés en entretien (D24, D83). Au 11 octobre, 107 des 111 événements de Guillaume attendent leur classement.

### Reste avant l'essai en binômes de collègues (T4.6)

- Fermer les revues de sécurité T3.1b et T3.1c.
- Finir l'app Mac (T3.4).
- Hygiène de configuration (T4.15).
- Raccorder automatiquement les treize clients sur Mac, Windows et Linux (T4.22, D84).
- Préparer le relais déjà en place sur le VPS (T4.6a) et le lien unique pour rejoindre l'équipe en deux clics (T4.23).
- Construire l'app Windows (T3.7), puis tester à quatre : VPS, Mac et deux PC Windows (T4.6c).
- Construire l'app Linux (T3.8) et mener le design au niveau impeccable (T4.24).
- Écrire le protocole de l'essai en profil privé (T4.6b). L'ancien protocole des [essais](essais/README.md) est historique.
- Si l'essai inclut le partage par modèle : qualifier un modèle (T3.2) et choisir outils, modèle et approbateur depuis le panneau (T4.16).

### Reste avant le lancement

- Résilience du protocole et du stockage anti-rejeu (T3.1d, T3.1e).
- Preuve privée d'ensemble avec Internet bloqué (T3.5).
- Relier les scénarios déjà testés à leurs tests (T4.20).
- Préparer la publication : audit, licences, signalement privé, paquets (T3.6).
- Nom du produit, offre et lancement public (T4.13), avec l'accord de Guillaume.

Après l'essai seulement : simulation complète (T4.7), agent inclus (T4.8), petite question (T4.9), relais d'entreprise en binaire (T4.10b), tâches déléguées (T4.11), contexte partagé (T4.12). La passerelle grand public pour Claude et ChatGPT (T2.13) est mise de côté : le profil privé la refuse.

## Reproduire la vérification

```bash
pnpm -r lint
pnpm -r typecheck
pnpm -r test
openspec validate --all --strict
npx --yes openspec-guard@0.3.0 check --require-selector --baseline .openspec-guard-baseline.json --fail-on fail
pnpm site:build
```

Ces tests ne demandent ni clé de modèle ni accès au lab. Le site est une présentation statique ; sa simulation ne connecte aucun agent.
