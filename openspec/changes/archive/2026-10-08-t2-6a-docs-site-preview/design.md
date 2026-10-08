# Design

## Context

Le dépôt comporte sept packages, 221 tests verts au premier passage, 31 tâches produit (23 `done`, 2 `doing`, 6 `todo`). `openspec-guard` relie 48 critères à un test, en gèle 259 dans la baseline et en exclut 14. Ce dernier chiffre mesure la traçabilité, pas la couverture du code. Voir `proposal.md` pour le périmètre.

Ce contexte décrit le début de la session. Les changements T2.9 et T2.5 ont ensuite été intégrés par d'autres travaux. Le bilan livré est arrêté au commit `cacf1cc` : 32 tâches produit, dont 25 `done`, 2 `doing`, 4 `todo` et 1 `blocked`. Vérification finale : 229 tests dans 20 fichiers, dont les 3 tests ajoutés ici ; 54 critères reliés sur 313 testables, 259 gelés et 14 exclus. Les preuves et la clôture se trouvent dans `evidence.md`.

## Goals / Non-Goals

Le lecteur doit comprendre le besoin, le parcours, la frontière de confiance et la maturité réelle sans connaître MCP. Les développeurs doivent trouver les commandes et sources utiles. Le site n'appelle aucun service drop et sa simulation porte explicitement ce nom.

## Decisions

- HTML et CSS natifs, interactions par contrôles HTML (radios, liens, accordéons). Aucun framework ni dépendance supplémentaire ; JavaScript applicatif inutile pour ce parcours éditorial.
- `docs/GUIDE.md` et `docs/AVANCEMENT.md` forment les documents lisibles dans le dépôt. Trois SVG partagés entre les documents et le site. Les pages HTML offrent une lecture éditoriale plus courte et renvoient aux documents téléchargeables.
- `scripts/site.ts` assemble uniquement les fichiers publics explicitement sélectionnés dans `dist/site`. La prévisualisation écoute sur `127.0.0.1`, sans exposer le dépôt entier.
- Direction : papier blanc bleuté `#f5f8ff`, encre `#15234b`, cobalt `#2548ed`, bleu clair `#e7efff`, vert profond `#226655`. Titres géométriques avec la pile locale Avenir Next / sans-serif, texte système, serif ponctuelle pour les questions. Aucune police distante.
- La composition met une question en regard d'une carte de consentement, reliées par une trajectoire bleue. Les sections suivantes utilisent des schémas, une liste de capacités et une frise ; éviter une succession de cartes identiques.
- La demande autorise la réalisation. Le point d'arrêt de publication de l'index reste applicable et sera présenté une fois la prévisualisation vérifiée.

## Requirements and acceptance

| Exigence | Critère | Vérification |
| --- | --- | --- |
| REQ-DOC-1 : état sourcé | AC-DOC-1 : bilan daté, tâches comptées, tests et limites de preuve distingués | Commandes et inspection |
| REQ-DOC-2 : pédagogie | AC-DOC-2 : guide avec exemple, vocabulaire, trois schémas, commandes et limites de confidentialité | Lecture et rendu des SVG |
| REQ-SITE-1 : parcours | AC-SITE-1 : accueil, guide, bilan reliés, simulation sans réseau et sans faux installateur | Navigateur, liens et clavier |
| REQ-SITE-2 : lisibilité | AC-SITE-2 : bureau et mobile sans débordement, focus visible, alternatives textuelles | Captures et inspection |
| REQ-SITE-3 : isolation | AC-SITE-3 : construction reproductible, seuls les documents choisis sont servis, requêtes hors périmètre refusées | Tests HTTP |
| REQ-VERIFY-1 : non-régression | AC-VERIFY-1 : lint, types, tests, guard, revue et vérification des liens passent | Commandes et revue |

## Risks / Trade-offs

| Risque | Probabilité / impact | Mesure | Statut initial |
| --- | --- | --- | --- |
| R1 : confondre prototype et produit prêt | Forte / élevée | Statuts datés, aucun bouton de téléchargement fictif, simulation étiquetée | À vérifier |
| R2 : laisser penser qu'un modèle distant ne reçoit rien | Moyenne / élevée | Explication explicite du contexte transmis au fournisseur et des limites du scanner | À vérifier |
| R3 : servir des fichiers privés du dépôt | Faible / élevée | Copie publique en allowlist, serveur borné au résultat, tests de refus | À vérifier |
| R4 : dérive entre bilan et code ultérieur | Forte / moyenne | Date, commit de référence, liste de commandes pour rafraîchir | Accepté avec mesure |
| R5 : dépendance à une police ou bibliothèque externe | Faible / moyenne | Polices système, SVG autonomes, aucun CDN | Évité |

## Coverage and verification plan

Applicables : comportement éditorial, UX, intégrité des informations, confidentialité, sécurité du serveur local, accessibilité, performance statique, contrats décrits, diagnostic, testabilité, tests d'intégration HTTP, vérification navigateur, construction, packaging, documentation, expérience développeur, nettoyage des instructions obsolètes.

Sans changement d'exécution : authentification, autorisation produit, intégrations externes, réseau des Nodes, API des capacités, logs et métriques du produit. Ces sujets sont expliqués, pas modifiés.

Non applicables : chargement asynchrone, état vide, erreurs de formulaire, annulation, retries, persistance utilisateur, restauration, concurrence métier, idempotence, cache applicatif, migrations, migration utilisateur, compatibilité de données. Aucun formulaire ou état serveur métier. Navigation et contenu restent utilisables hors ligne après téléchargement des fichiers. Déploiement et rollback public sont hors de cette change ; la suppression de `dist/site` suffit à retirer la prévisualisation générée.

Exécuter les contrôles du dépôt puis chercher activement les liens cassés, promesses excessives, données privées, contrastes faibles, débordements et commandes erronées. La recette humaine porte seulement sur la compréhension et l'identité visuelle.
