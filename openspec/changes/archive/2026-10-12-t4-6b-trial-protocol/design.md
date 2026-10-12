# Design : protocole de l'essai en profil privé

## Context

Le protocole doit décrire ce que le produit fait vraiment au 12 octobre 2026 (`main` au commit `8126108`), pas ce
que D84 vise. Faits relevés pendant la rédaction, chacun avec sa source :

- Relais de l'essai : `/health` répond `{"ok":true,"nodes":1,"build":"8126108…"}`, le commit de `main` (D91).
- Page `https://drop.memolabs.dev/join` : 404 (nginx). Le fichier existe (`site/join.html`), sa mise en ligne est
  dans T4.31.
- Aucune release GitHub (`gh release list` vide). La build notarisée du 10 octobre vient de `5242fd7`, avant la
  fusion de T4.23 (PR #58) : elle ne connaît pas le lien unique.
- Windows et Linux : PR #45 ouverte.
- Expiration d'une demande sans décision : 10 minutes (`APPROVAL_TTL_MS`, `packages/node/src/engine.ts`).
- Reçus : `~/.drop/receipts/AAAA-MM-JJ.jsonl`, avec `requested`, `decided`, `delivered`, `decision`, `answeredBy`,
  écrits chez l'exécutant et envoyés au demandeur (`writeReceipt`, `packages/protocol/src/receipt.ts`). Un fait publié
  porte `answeredBy: "fact"` et n'a pas de décision humaine.
- Profil privé : iroh n'annonce ni ne compose d'adresse directe hors des plages privées (`privateSocket`,
  `packages/node/src/iroh.ts`) ; iroh est désactivé par défaut ; n0 refusé (D68). Aucun composant n'enregistre le
  chemin pris par un envoi. Le relais journalise `from`, `to`, `id`, `size` de chaque enveloppe.
- Routage de `ask_team` : seuls un outil partagé qui prend une question libre ou un fait publié rendent une personne
  joignable (`packages/node/src/route.ts`).
- Admission au relais : seulement par invitation d'un Node admis (T2.1) ; un pair reçoit le catalogue sur
  `catalog_request` (`packages/node/src/engine.ts`).
- Démarrage automatique : plugin `autostart` de Tauri en `LaunchAgent`, nom tiré du `productName` « drop ».

## Goals / Non-Goals

**Goals :** un protocole que Guillaume suit sans inventer de procédure ; chaque étape marquée **Disponible** ou **Pas
encore livré** ; des mesures calculables avec les données que le produit écrit déjà ; une fiche d'accord qui dit
exactement ce qui circule.

**Non-Goals :** voir `proposal.md`.

## Decisions

1. **Remplacer `docs/essais/README.md` en place, plutôt qu'ajouter un fichier.** La ligne de l'index dit « remplace »,
   et `docs/AVANCEMENT.md` pointe déjà vers ce chemin. L'ancien texte reste accessible par `git show efb98d9:…`.
   Écarté : garder l'ancien et en ajouter un nouveau, qui laisserait deux protocoles dont un faux.
2. **Fiche d'accord dans un fichier séparé**, parce qu'elle va à une autre personne (le testeur) que le protocole
   (Guillaume) et doit pouvoir être envoyée seule. Même raisonnement que le kit D24 (T0.7, décision 1).
3. **Deux mots d'état seulement**, « Disponible » et « Pas encore livré », reprenant l'esprit des statuts du PRD
   (Existant, Visé). Une condition d'entrée qui n'est pas remplie bloque l'essai, elle n'est pas contournée.
4. **Rejoindre en collant le lien dans Mon espace** tant que `/join` n'est pas servie : c'est le seul chemin du lien
   unique qui marche sans la page (T4.23, « J'ai reçu une invitation »). Le parcours visé par D84 est décrit à côté,
   marqué non livré.
5. **« Décidées dans la demi-heure » mesuré par les reçus**, faits exclus, en signalant que l'expiration à 10 minutes
   ramène la mesure à la part des demandes non expirées. Le protocole ne change pas ce délai : c'est une question
   pour Guillaume.
6. **« Installation jusqu'à la première réponse » mesuré au chronomètre**, de l'ouverture du message d'invitation à
   la réponse affichée dans l'agent ; recoupé par `createdAt` de l'identité et le premier `delivered`. Aucun fichier
   ne connaît l'instant où la personne ouvre le lien.
7. **H5 déclaré non mesurable tel qu'écrit** dans le profil privé, avec une approximation par le journal du relais.
   Écarté : présenter cette approximation comme la mesure de H5. La mesure exacte demande un relevé du chemin dans le
   Node, proposé comme ligne `todo` dans la PR.
8. **Canal de correction : celui qui existe.** Relais par `main` puis GHCR puis autodeploy (D91) ; app par DMG et
   manifeste vérifiés à la main (`docs/MAC_RELEASE.md`). Les mises à jour signées (D70) sont citées comme non livrées.
9. **La mesure D24 n'est pas dupliquée.** Le protocole renvoie au kit de T0.7 et précise que ses entretiens restent
   séparés.

## Risks / Trade-offs

- [Le protocole vieillit vite : plusieurs conditions d'entrée vont changer avant l'essai] → tableau daté en section 2,
  à relire avant chaque binôme, avec la commande qui vérifie chaque ligne.
- [Commandes `jq` jamais passées sur de vrais reçus] → éprouvées sur des reçus fabriqués selon le schéma, et le
  document le dit.
- [Le nom du fichier de démarrage automatique est déduit du code] → écrit comme déduit, avec la voie par les Réglages
  Système en premier.
- [La fiche d'accord engage Guillaume sur la conservation des données] → délai et canal laissés entre crochets, à
  remplir par lui.
