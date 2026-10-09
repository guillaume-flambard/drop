# Tasks

## 1. Contrat UUIDv7

- [x] 1.1 Écrire le test UUIDv4 refusé, implémenter le schéma UUIDv7 du seul `drop_request` et vérifier le test protocole.

## 2. Anti-rejeu local

- [x] 2.1 Écrire les tests d'expiration, doublon, purge, redémarrage, retour d'horloge, corruption et saturation ; implémenter l'admission bornée et vérifier les tests Node ciblés.
- [x] 2.2 Documenter la migration UUIDv4 → UUIDv7 et le stockage local ; vérifier les exemples du guide.
- [x] 2.3 Empêcher deux processus partageant un `DROP_HOME` de dépasser la borne, avec test de verrou concurrent et refus fermé.
- [x] 2.4 Normaliser la casse des UUIDv7 avant admission et persistance pour qu'un même identifiant ne crée jamais deux marqueurs sur Linux ; vérifier par test lower/upper.

## 3. Relais

- [x] 3.1 Écrire le test de reconnexion sous quota épuisé, porter le compteur sur l'identité authentifiée et vérifier les tests relais ciblés.
- [x] 3.2 Compter les enveloppes rejetées pour taille excessive dans le quota de leur identité et vérifier par un test d'intégration.
- [x] 3.3 Compter les trames malformées après authentification avant parsing, avec test de régression contre le contournement constaté par revue indépendante.
- [x] 3.4 Gérer sans erreur non interceptée les trames refusées par `ws` avant `message` et les compter pour l'identité authentifiée ; test rouge puis vert après reconnexion.
- [x] 3.5 Compter aussi les trames UTF-8 invalides rejetées en amont par `ws` ; test rouge puis vert après reconnexion.

## 4. Vérification

- [x] 4.1 Exécuter `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r test` et `openspec validate --strict` ; conserver les sorties dans la preuve.
- [x] 4.2 Exécuter openspec-guard avec sélecteurs, puis mettre à jour la baseline seulement si son diff retire des entrées.
- [ ] 4.3 Terminer /review gstack et consigner la limite du recheck /cso ; corriger tout constat P0/P1 confirmé.

## Workflow follow-up

- Archiver la change, marquer T3.1b terminé dans l'index, garder T3.1a en attente de sa propre clôture, puis committer.
