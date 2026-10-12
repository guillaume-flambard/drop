# OpenWhispr pour drop : ce qu'on reprend pour l'app de bureau

12 octobre 2026. Lecture statique d'OpenWhispr au commit `5f9a88b` (10 octobre 2026), rien n'a été exécuté.
Quatre analyses en parallèle (coque, interface, fiabilité, état actuel de drop), puis vérification à la main des
points cités sur drop. Chemins OpenWhispr relatifs à la racine de leur dépôt.

## Verdict

Leur stack ne s'emprunte pas : Electron, JS brut dans le process principal, fichiers de 100 à 300 Ko. Ce qui
s'emprunte, c'est leur **finition** : un seul système de design, des états toujours nommés, des erreurs qui disent ce
qui est arrivé aux données, une coque qui ne vole jamais le focus, une carte d'approbation exemplaire, et des
décisions isolées dans des modules purs testés. Presque tout se transpose à drop sans ajouter de dépendance ni de
couche.

## Leur app de bureau en une page

| Couche | Chez OpenWhispr | Équivalent drop |
| --- | --- | --- |
| Coque | Electron 41, `main.js`, `src/helpers/windowManager.js`, `windowConfig.js` | Tauri 2, `apps/desktop/src-tauri/src/main.rs` |
| Fenêtres | panneau de contrôle 1200×800, pastille flottante, carte de notification, guide de permissions, onboarding | panneau 380×620, espace 980×720, page de démarrage |
| Pont interface | `preload.js` : 500 méthodes, 133 écouteurs, enveloppe `{success, code, messageKey, technicalDetails}` | API HTTP locale du Node, SSE `/ui/events` |
| Natif | un binaire Swift ou C par fonction, supervisé (relance, backoff, PID, nettoyage au démarrage) | `drop-iroh` piloté par stdin/stdout |
| Interface | React 19, Radix/shadcn, Tailwind 4 `@theme`, zustand, i18next (11 langues), icônes vendorisées | React 19, Radix/shadcn, Tailwind 4, Lucide, français seul |
| Données | SQLite WAL, migrations ad hoc | fichiers sous `~/.drop/` |
| Secrets | clé maîtresse dans le trousseau + AES-256-GCM | clés `~/.drop/` en `0600` (règle AGENTS.md) |
| Tests | `node:test` + tsx, 786 fichiers, composants rendus par SSR | vitest |
| Release | tag vérifié contre la version, signature et notarisation, manifeste de mise à jour par architecture | `scripts/build-mac.ts`, notarisation, updater Tauri signé minisign |

## drop aujourd'hui, en bref

Points forts déjà acquis, à garder : CSP stricte, aucune ressource distante, mouvement réduit et contraste respectés,
onglets ARIA au clavier, carte de consentement riche (registre « recevra / ne recevra jamais », compte à rebours,
réponse à la main avec relecture), superviseur du daemon avec budget de relance, page de démarrage avec codes.

Ce qui fait « basique » (lu dans le code) :

- **Deux systèmes de design** : le panneau (`packages/node/src/panel.ts`, script ES5 dans une chaîne, 1 085 lignes)
  et l'espace React (`packages/desktop-ui`). Trois violets différents (`#5656a9` dans `panel-human.ts`, `#6660aa`
  dans `styles.css`, et le vert `#0E5F58` de `panel.ts` écrasé).
- **L'espace ne sait pas décider** : il n'appelle jamais `/ui/pending`, n'a pas de SSE, se rafraîchit à la main,
  n'affiche pas les codes d'erreur qu'il reçoit.
- **Icône de barre de menus sans état** : pas de compteur de demandes, pas d'état hors ligne ou erreur.
- **Mise à jour muette** : un élément de menu, rappels de progression vides, échec seulement dans `app.log`.
- **Démarrage automatique imposé** : `enable()` à chaque lancement (`main.rs:763`), sans réglage.
- **Pas de premier lancement** : identité créée en silence, aucun choix de réseau, alors que `docs/product/UX_UI.md`
  §4.4 le prescrit.
- **Diagnostic invisible** : `daemon.log` vidé à chaque démarrage (`main.rs:141`, `File::create`), donc les
  journaux d'un plantage disparaissent à la relance ; aucune version affichée, aucun « copier le diagnostic ».
- **Bug, corrigé depuis** : `packages/desktop-ui/src/views/network.tsx` n'avait pas de cas `n0`, un réglage iroh
  enregistré s'affichait « Non configurée ».

## Ce qu'on reprend, en quatre lots

Classés par gain pour l'utilisateur et par coût. Aucun ne demande une nouvelle dépendance, sauf mention.

### Lot A. Un seul langage visuel (gain fort, coût faible)

1. **Tokens Tailwind 4 complets** (`src/index.css`) : surfaces `surface-0` à `surface-3`, `surface-raised`,
   `surface-window` ; bordures `border-subtle/-hover/-active` ; rayons `--radius` 6 px et `--radius-shell` 12 px ;
   ombres nommées (`card`, `card-hover`, `elevated`, `modal`) ; en sombre, une rampe oklch à teinte fixe où la
   surface se lit comme l'élévation. Un seul accent pour tout drop.
2. **Bloc mouvement réduit global** : retire `transform` des transitions mais garde opacité et couleur ; courbe
   `cubic-bezier(0.23,1,0.32,1)`, jamais d'ease-in ; entrée 320 ms, appui `scale(0.97)` 160 ms.
3. **Jetons dédiés par parcours** (leur `--onboarding-*`) : le bloc sombre ne remappe que les jetons, les composants
   n'ont aucune variante `dark:`.
4. **Le panneau passe sur les composants partagés.** C'est déjà T4.21 et T4.24 ; l'emprunt donne la cible.

### Lot B. La carte de consentement au niveau d'OpenWhispr (gain très fort, coût faible)

Leur `src/components/chat/ApprovalCard.tsx` et `src/stores/connectorApprovalStore.ts` sont le meilleur morceau du
dépôt pour drop.

1. **États nommés et copie qui dit ce qui est arrivé aux données** : en attente, décision en cours, autorisé,
   refusé (« Rien n'a été envoyé »), expiré, incertain (« Impossible de confirmer l'envoi »). Un résultat illisible
   devient « incertain », jamais « non envoyé ».
2. **Seule une carte en attente peut expirer** ; une décision en cours ne se retire pas.
3. **Une seule région `aria-live` par surface**, présente dès le rendu ; après une décision, le focus va sur la carte
   puisque le bouton disparaît ; un bouton bloqué reste focalisable (`aria-disabled` + raison).
4. **Carte purement visuelle, partagée** entre panneau, espace, aperçu d'onboarding et future notification (leur
   `MeetingNotificationCard` « pour que les deux ne divergent jamais »). Logique dans un `consentCardModel.ts` pur,
   testé seul.
5. **L'espace gagne la décision** : liste des demandes en attente et SSE, aujourd'hui absents.

### Lot C. Une coque qui se fait oublier (gain fort, coût moyen, côté Rust)

1. **Icône à états** : compteur de demandes en attente, hors ligne, erreur de démarrage. OpenWhispr ne le fait pas ;
   pour drop, c'est le premier signal produit.
2. **Mise à jour lisible** (`src/updater.js`, `src/hooks/useUpdater.ts`) : vérification 3 s après le lancement puis
   périodique ; téléchargement selon une préférence explicite ; progression, toast « prête » une seule fois,
   confirmation avant redémarrage, notes de version ; un état « téléchargée » qu'une vérification suivante n'efface
   pas.
3. **Démarrage automatique respecté** (`src/helpers/autoStart.js`, `autoStartPolicy.js`, pur et testé) : réglage
   dans l'app, lancement à l'ouverture de session toujours discret, état « approbation requise » de macOS 13 montré,
   plus d'`enable()` forcé.
4. **Dock selon la fenêtre** (`dockManager.js`) : `Regular` pendant que l'espace est ouvert, `Accessory` sinon, pour
   que l'espace apparaisse dans Cmd-Tab. Tauri : `set_activation_policy`.
5. **Instance unique** (`tauri-plugin-single-instance`, dépendance à décider) : un second lancement réaffiche le
   panneau.
6. **Fenêtres** : position bornée à la zone utile de l'écran qui la porte (`clampToWorkArea`, origines négatives) ;
   l'espace se cache à la fermeture au lieu d'être détruit ; un filet de 10 s affiche la fenêtre si l'interface ne
   s'annonce jamais prête.
7. **Supervision** (`sidecarRegistry.js`, `sidecarReaper.js`) : arrêt de tous les processus avec délai à la sortie,
   fichier PID et nettoyage d'un daemon orphelin au lancement (en vérifiant la ligne de commande avant de tuer).
8. **Notifications** : T4.30, déjà ajoutée.

### Lot D. Diagnostic et rigueur (gain moyen, coût faible)

1. **Journaux** : garder le précédent (`daemon.log.1`) au lieu de vider ; en-tête système en haut de fichier ;
   balise de portée sur chaque ligne. Faire mieux qu'eux : **expurgation dans l'écriture même** (motifs plus noms de
   clés), rotation par taille et âge.
2. **Réglages « Diagnostic »** : version affichée, ouvrir le dossier des journaux, copier le chemin, copier un
   diagnostic expurgé.
3. **Erreurs typées** (`providerHttpErrors.js`, `describeProviderError.ts`) : code, phrase traduite, lien vers le
   réglage qui corrige, détails techniques repliables et copiables (`TechnicalErrorDetails`). L'espace affiche enfin
   `WorkspaceApiError.code`.
4. **Petits hooks** : `useDelayedFlag(flag, 300)` contre les spinners qui clignotent, `useCopyFeedback`.
5. **Kit de composants** (30 à 80 lignes chacun) : `EmptyStateCard`, `InfoBox`, `PermissionCard` (devient la ligne
   pair ou agent), `OptionCard`, `StepProgress`, toast maison avec actions et retour « fait / échec » sur le bouton.
6. **Premier lancement** (`src/components/onboarding/flow.ts`) : parcours versionné et reprenable (bienvenue, choix
   du réseau, raccordement des agents, rejoindre une équipe), compté « 1 sur N », aperçus des vrais composants.
   Rejoint T4.23 et UX_UI §4.4.
7. **Tests** : un module pur à côté de chaque composant ou store qui décide ; garde « sauté en local, échec en CI »
   pour les tests qui demandent un binaire natif.
8. **i18n, plus tard** : si une interface anglaise arrive, leur `scripts/check-i18n.js` (clés, variables, pluriels
   par `Intl.PluralRules`).

## Ce qu'on ne prend pas

- Electron, l'IPC plat de 500 méthodes sans types générés, les fichiers géants.
- `webSecurity: false` et une CSP limitée aux images sur leur fenêtre principale (`windowConfig.js:234`).
- Le cloud par défaut et le SDK multi-fournisseurs (contraires à D34 et à la règle `fetch` sans SDK).
- Le repli en clair quand aucun trousseau n'est disponible ; les migrations SQLite ad hoc.
- Le trousseau pour les clés de drop : la règle actuelle fixe `~/.drop/` en `0600`. À évaluer seulement par une
  décision écrite.
- Le verre et les dégradés de marque : choix de style, à trancher dans T4.24, pas une pratique.

## Où c'est rangé dans `docs/TASKS.md`

| Lot | Ligne |
| --- | --- |
| A. Langage visuel unique | T4.24, périmètre précisé |
| B. Carte de consentement | T4.35 |
| C. Coque (icône à états, mise à jour, démarrage auto, Dock, fenêtres, supervision) | T4.36 ; l'instance unique est dans T4.31 |
| D1 à D3. Journaux et diagnostic | T4.37 |
| D6. Premier lancement | à rattacher à T4.23, en cours sur sa branche |
| Notifications | T4.30 |
| Bug `n0` de `network.tsx` | corrigé (`fix:`) |
| Docs en retard sur le code (UX_UI : accent, menu, notifications ; titre de l'espace) | à corriger (`docs:`) |
