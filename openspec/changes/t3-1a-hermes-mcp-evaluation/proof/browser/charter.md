# Charter QA navigateur T3.1a

- **Contrat :** la page locale d’avancement expose la recette Hermes; le lien ouvre le Markdown expurgé, servi en `text/markdown`.
- **Risque :** lien absent, route de téléchargement 404, contenu obsolète ou erreur d’exécution visible dans la console.
- **Entrée :** `http://127.0.0.1:4173/avancement.html`, preview local existant.
- **Isolation :** lecture GET uniquement sur loopback; aucune navigation externe, aucun formulaire, aucune mutation.
- **Source :** `site/avancement.html`, `scripts/site.ts`, `docs/HERMES.md`, `test/site.test.ts`.
- **Préconditions :** serveur preview détecté sur 127.0.0.1:4173; serveur du site statique à allowlist explicite; navigateur gstack headless prêt.
- **Sondes prévues :** charger la page et vérifier titre/lien/console; ouvrir le lien Hermes, vérifier statut, type et contenu; contrôler les liens internes visibles.
- **Sortie :** deux routes lisibles, lien Hermes présent, aucune erreur console ni lien interne cassé; sinon conserver l’observation et déclarer le défaut ou le blocage.
- **Écritures permises :** preuves QA sous ce dossier uniquement. Aucun changement de source, aucun commit.
