# Spec Delta

## REMOVED Requirements

### Requirement: Unités systemd durcies

D22 (2026-10-08) a remplacé ces unités par des conteneurs construits depuis ce dépôt et déployés depuis le dépôt
d'infrastructure privé (« adapté à l'infrastructure qui tourne au lieu du Caddy et des unités systemd de la spec 08 »).
`deploy/vps/drop-relay.service` et `deploy/vps/drop-node.service` n'ont jamais existé dans l'historique git : garder
l'exigence demanderait à un agent de créer des fichiers fantômes.

### Requirement: Exemple de Caddyfile

Même cause, D22 : le reverse proxy réel est Traefik, piloté depuis le dépôt d'infrastructure privé. Aucun
`Caddyfile.example` n'a existé dans ce dépôt.

## ADDED Requirements

### Requirement: Le relais de l'essai déclare son identité de build

Le relais que fait tourner le VPS sous `drop.memolabs.dev` (D84) MUST exposer son identité de build par sa sonde, et
l'exploitation MUST pouvoir dire, sans accès au serveur, si le commit en marche est celui qu'elle entend servir.

#### Scenario: AC: le relais de l'essai tourne le commit attendu

<!-- openspec-guard:non-testable reason="déploiement réel sur le VPS, vérifié par curl contre drop.memolabs.dev" -->

- **WHEN** on interroge `https://drop.memolabs.dev/health`
- **THEN** l'identité de build annoncée n'est pas la valeur d'absence
- **AND** elle est le commit que l'exploitation a l'intention de servir

### Requirement: Le relais de l'essai révoque sans redémarrage

La configuration du relais de l'essai MUST nommer un `revokedPath` posé sur le même volume persistant que
`admittedPath` (D69), pour que `drop-relay revoke <nodeId>` s'applique à un relais en marche sans rien perdre au
redéploiement suivant (T2.19, D75).

#### Scenario: AC: le relais de l'essai garde ses révocations

<!-- openspec-guard:non-testable reason="déploiement réel sur le VPS, vérifié dans la configuration de la pile" -->

- **WHEN** on lit la configuration du relais déployé
- **THEN** `revokedPath` est nommé et vit sur le volume persistant que le dépôt expose pour l'état du relais
- **AND** un Node révoqué pendant que le relais tourne est refusé sans redémarrage
