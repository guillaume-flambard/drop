# T4.6b : protocole de l'essai en profil privé

## Why

T4.6, l'essai en binômes de collègues (D83), dépend de T4.6b : il faut un protocole avant d'inviter qui que ce soit.
Le seul qui existe, `docs/essais/README.md` (T2.7, 9 octobre 2026), suppose le profil historique : clé plafonnée
payée par le demandeur (D27), passerelle publique (T2.13), deux personnages de scénario. Le profil privé, seul créé
par l'app, refuse les deux. Les mesures d'usage du PRD (décisions dans la demi-heure, installation jusqu'à la
première réponse, connexions directes H5) n'ont ni définition opérationnelle ni source de données, et rien ne dit
comment livrer une correction ou tout retirer chez un testeur.

## What Changes

- **`docs/essais/README.md` remplacé** par le protocole de l'essai en profil privé, pour Guillaume : conditions
  d'entrée datées (chacune **Disponible** ou **Pas encore livré**, avec sa tâche et sa commande de vérification),
  recrutement, préparation d'un binôme, séance d'installation pas à pas, observation, canal de correction,
  désinstallation, compte rendu. L'ancien texte reste dans l'historique git.
- **`docs/essais/fiche-accord.md`, nouveau** : la fiche d'accord que lit et signe chaque testeur (ce qui s'installe,
  ce qui circule et qui le voit, ce qu'on relève, ce qu'on ne relève jamais, captures, arrêt et retrait).
- **Mesures rendues opérationnelles** à partir de ce que le produit enregistre vraiment : reçus signés
  (`~/.drop/receipts/`), heure de création de l'identité, journal du relais. Commandes `jq` éprouvées sur des reçus
  fabriqués selon le schéma.
- **`docs/AVANCEMENT.md`** : la phrase qui renvoyait à l'ancien protocole comme historique renvoie au nouveau.

## Capabilities

Documentation seule : aucun comportement du système ne change, donc `skip_specs: true`. La ligne T4.6b de l'index le
dit (« Documentation, sans changement de contrat »).

## Non-goals

- **La mesure D24** : elle vient de T0.7 et de `docs/kit-d24-entretien.md`, que le protocole cite sans le recopier.
- **H3** : la compréhension par des non-techniciens demande un test séparé (D83).
- **Construire ce qui manque** : nouvelle build Mac, page `/join` en ligne, release, Windows et Linux, relevé du chemin
  de chaque envoi. Le protocole le signale comme **pas encore livré** ; les manques nouveaux sont proposés à Guillaume
  dans la PR, pas ajoutés à l'index par cette change.
- **Recruter, conduire l'essai** : Guillaume.

## Impact

- `docs/essais/README.md` (remplacé), `docs/essais/fiche-accord.md` (nouveau), `docs/AVANCEMENT.md` (une ligne).
- Aucun code, schéma, dépendance ni contrat. `docs/TASKS.md` et `docs/DECISIONS.md` ne sont pas modifiés par cette
  change : les décisions à noter et les questions pour Guillaume sont dans la PR.
