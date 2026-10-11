# Spec Delta

## ADDED Requirements

### Requirement: La sonde de santé porte l'identité de build

`GET /health` MUST répondre, outre le compte de connexions, avec l'identité de build du relais en marche, afin qu'un
déploiement soit vérifiable sans accès au serveur. Cette identité MUST provenir de la construction de l'image et MUST
rester une chaîne non secrète ; une construction qui n'en a pas fourni MUST répondre plutôt que mentir sur une version.

#### Scenario: AC: l'identité de build est lisible par une sonde

<!-- openspec-guard:test="relay > reports the build identity alongside the connection count" -->

- **WHEN** une demande `GET /health` atteint le relais
- **THEN** la réponse porte le compte de connexions et une identité de build non vide

#### Scenario: AC: un build sans identité ne laisse pas la sonde tomber

<!-- openspec-guard:test="relay > falls back to an explicit absence instead of failing the probe" -->

- **WHEN** le relais tourne sans identité de build dans son environnement
- **THEN** `GET /health` répond toujours en 200 avec une valeur explicite d'absence
