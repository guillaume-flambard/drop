# Protocole de l'essai en binômes de collègues (T4.6b)

Ce document est pour Guillaume, qui organise et observe l'essai T4.6. Il dit quelles conditions remplir avant de
commencer, qui recruter, comment se passe l'installation, ce qu'on mesure et avec quelles données, comment livrer une
correction pendant l'essai, et comment tout retirer à la fin. La fiche à faire lire et signer à chaque testeur est
[`fiche-accord.md`](fiche-accord.md).

Il remplace le protocole T2.7 du 9 octobre 2026 (Julie et Natha, profil historique), devenu faux pour le profil
privé : il supposait une clé plafonnée payée par le demandeur (D27) et la passerelle publique (T2.13), que le profil
privé refuse. L'ancien texte reste lisible dans l'historique : `git show efb98d9:docs/essais/README.md`.

**État des lieux : 12 octobre 2026, `main` au commit `8126108`.** Chaque étape porte l'un de ces deux mots :

- **Disponible** : présent sur `main`, avec sa source ;
- **Pas encore livré** : l'étape en dépend, avec la tâche qui le porte. Ne pas le présenter aux testeurs comme acquis.

Relire le tableau de la section 2 avant chaque binôme : plusieurs lignes changeront avant le début de l'essai.

## 1. Ce que l'essai mesure, et ce qu'il ne mesure pas

L'essai met drop entre les mains de personnes qui travaillent vraiment ensemble (D83) : chacune a des questions dont
la réponse vit dans les outils de l'autre. Les mesures viennent du [PRD](../product/PRD.md), section 7.

| Mesure                                   | Seuil (PRD)                               | Données                                  | Section |
| ---------------------------------------- | ----------------------------------------- | ---------------------------------------- | ------- |
| Demandes décidées dans la demi-heure     | proposition à confirmer : au moins 70 %   | reçus locaux des deux membres du binôme | 6.1     |
| Installation jusqu'à la première réponse | proposition à confirmer : moins de 10 min | chronomètre, recoupé par les reçus       | 6.2     |
| Connexions directes sans relais (H5)     | environ 90 % (hypothèse tirée d'iroh)     | journal du relais, recoupé par les reçus | 6.3     |
| Frictions et hypothèses des parcours     | aucun seuil                               | journal d'observation                    | 6.4     |

Ce que l'essai ne mesure pas :

- **Le besoin (D24).** Il se mesure en T0.7, avec le [kit de mesure](../kit-d24-entretien.md), et l'essai attend son
  verdict GO ou « à prolonger » (D83). Ce protocole ne le refait pas et n'en change rien. Si un testeur est
  développeur et participe aussi à la mesure, il garde blocked-observer et suit ce kit tel quel ; ses entretiens D24
  restent séparés des rendez-vous de l'essai. Le PRD, section 7, place encore le seuil D24 dans l'essai : c'est
  antérieur à D83, qui l'en a détaché.
- **La compréhension par des non-techniciens (H3).** Elle demande cinq personnes non techniques et un test séparé
  (D83).

> **Mise à jour du 13 octobre 2026 — préparation des appareils :** les statuts du tableau
> ci-dessous sont un instantané du 12 octobre. Les installateurs multiplateformes existent
> maintenant dans la release **brouillon** `v0.1.0-ci.36`, et `/join` répond en HTTPS.
> Pour les premières installations et les preuves à relever, utiliser la
> [recette bêta multi-OS](recette-beta-multios.md). Les tests physiques Windows/Linux
> et une signature Windows Authenticode ne sont **pas encore validés**.

## 2. Conditions d'entrée

Aucun binôme n'est invité avant que chaque ligne soit remplie. Les dépendances complètes sont sur la ligne T4.6 de
[`docs/TASKS.md`](../TASKS.md) ; voici celles qui touchent directement ce protocole.

| Condition | État au 12 octobre 2026 | Vérifier |
| --------- | ----------------------- | -------- |
| Verdict D24 GO ou « à prolonger » | **Pas encore livré** : T0.7 attend le recrutement et les entretiens. | `blocked-observer report --merge` (kit, section 7) |
| Relais de l'essai à jour | **Disponible** (T4.6a, D91) : `wss://drop.memolabs.dev/v1`, et `/health` donne le commit qu'il tourne. | `curl -s https://drop.memolabs.dev/health` : `build` égal à `git rev-parse origin/main` (observé : `8126108`, `nodes: 1`) |
| App Mac qui contient le lien unique | **Pas encore livré** : la build notarisée du 10 octobre vient du commit `5242fd7`, antérieur à la fusion de T4.23 (PR #58). Il faut une nouvelle release signée et notarisée depuis `main`, puis la recette manuelle de T3.4 (Mac propre, VoiceOver). | `docs/MAC_RELEASE.md`, recette T3.4 |
| Mac Apple silicon | **Disponible** pour Apple silicon seulement : aucune build Intel n'est notarisée. | « À propos de ce Mac » chez chaque testeur |
| Apps Windows et Linux | **Pas encore livré** : PR #45 ouverte (T3.7, T3.8). D84 les exige avant l'essai. | PR #45 fusionnée, puis banc maison T4.6c |
| Page `https://drop.memolabs.dev/join` | **Pas encore livré** : la page existe dans le dépôt (`site/join.html`, T4.23), mais le VPS répond 404 (vérifié le 12 octobre). Sa mise en ligne avec sa propre CSP est dans T4.31. En attendant, le lien se colle dans l'app (section 5). | `curl -s -o /dev/null -w '%{http_code}' https://drop.memolabs.dev/join` donne `200` |
| Téléchargements publiés | **Pas encore livré** : aucune release GitHub n'existe (`gh release list` vide le 12 octobre), alors que la page `/join` renvoie vers `releases/latest`. En attendant, Guillaume envoie lui-même le DMG et son manifeste. | `gh release list` |
| Banc maison à quatre postes | **Pas encore livré** (T4.6c). | Ligne T4.6c `done` |
| Design du panneau | **Pas encore livré** (T4.24, PR #59 ouverte). | Ligne T4.24 `done` |
| Partage par modèle | **À décider par Guillaume.** Sans T3.2 et T4.16, l'essai se limite aux réponses à la main (T4.3) et aux faits publiés (T4.4), qui sont **Disponibles**. | Décision notée dans `docs/DECISIONS.md` |
| Relevé du chemin de chaque envoi | **Pas encore livré** : aucun composant ne l'enregistre (section 6.3). | Décision de Guillaume : essai sans mesure exacte de H5, ou ligne `todo` à faire avant |

## 3. Recruter les binômes

- **Au moins deux binômes, dans des contextes différents** (D83) : deux équipes, deux entreprises ou deux métiers.
  Chaque testeur vient avec une personne avec qui il travaille vraiment. Deux amis qui ne travaillent pas ensemble
  n'auraient rien de réel à se demander.
- **Une machine que drop sait faire tourner.** Tant que Windows et Linux ne sont pas livrés : un Mac Apple silicon
  pour chacun des deux. Noter la version de macOS et la puce.
- **Au moins un agent et un outil à partager, pour chacun.** Une question n'atteint une personne que si elle partage
  un outil qui accepte une question libre, ou publie un fait : le routage de `ask_team` ne retient que ceux-là et
  n'envoie rien sinon (`packages/node/src/route.ts`). Il faut donc à chacun un des treize clients MCP (D55) avec au
  moins un serveur MCP qu'il accepte de partager en lecture (GitHub, Linear, Notion, Figma, une base…). Une personne
  sans agent ne peut aujourd'hui que publier des faits ; l'agent inclus qui répondrait pour elle (T4.8) n'est **pas
  encore livré**. Déduit du code, pas observé.
- **L'accord de leur employeur, s'il le faut.** Installer une app et répondre depuis des outils de travail peut
  demander une permission que drop ne remplace pas. La fiche demande au testeur de le vérifier.
- **Durée** : proposition, deux semaines de travail normal par binôme, avec une séance d'installation, un point
  d'étape et un entretien de fin (section 6.5). À confirmer par Guillaume.

Avant toute installation, chaque testeur lit et signe [la fiche d'accord](fiche-accord.md).

## 4. Préparer un binôme (Guillaume, avant la séance)

1. **Relais.** `curl -s https://drop.memolabs.dev/health` : `ok: true` et `build` égal au commit de `main` que l'app
   embarque. **Disponible.**
2. **Paquet.** Préparer le DMG et son `drop-build-manifest.json`, puis vérifier soi-même, comme le décrit
   [`docs/MAC_RELEASE.md`](../MAC_RELEASE.md) : SHA-256 identique au manifeste, `codesign --verify --deep --strict`,
   `spctl --assess --type execute`, `xcrun stapler validate`. Une build qui contient le lien unique n'existe **pas
   encore** (section 2).
3. **Admission sur le relais.** Un poste neuf n'entre sur le relais de l'essai que par une invitation venue d'un Node
   déjà admis (T2.1) ; aujourd'hui le seul est le Mac de Guillaume (`allowedNodeIds`, T4.6a). `drop-relay allow` sur
   le serveur est exclu : le déploiement suivant l'écraserait (D22). Le premier membre du binôme rejoint donc par une
   invitation de Guillaume, le second par une invitation du premier, qui le parraine (D75). Conséquence : le Node de
   Guillaume reste pair du premier membre et peut lire les noms des outils qu'il partage (réponse à
   `catalog_request`, `packages/node/src/engine.ts`), jamais leur contenu ; toute question qu'il enverrait passerait
   par le consentement. Recommandation, à trancher par Guillaume : inviter depuis un Node dédié à l'admission, sans
   équipe ni outil partagé, distinct de son Node de tous les jours.
4. **Chronomètre et journal.** Une feuille par binôme : heure de chaque étape de la section 5, version de macOS, puce,
   agent et serveur MCP de chacun, et chaque accroc avec ce qui l'a contourné.

## 5. Séance d'installation (une par binôme, Guillaume présent)

Guillaume est présent, sur place ou en visio avec partage d'écran. Il observe et chronomètre ; il n'intervient que si
le testeur est bloqué, et note alors le blocage et l'aide donnée. Chaque membre fait les étapes à son tour.

**T0** : le testeur ouvre le message qui contient le lien d'invitation.

1. **Installer.** Ouvrir le DMG, glisser drop dans `/Applications`. Un lien `drop://` n'ouvre l'app que depuis
   `/Applications` (D30). **Disponible.**
2. **Lancer.** drop n'a pas d'icône dans le Dock, seulement dans la barre de menus
   (`apps/desktop/src-tauri/src/main.rs`). Noter si le testeur la trouve seul : c'est une hypothèse du parcours
   (APP_FLOW, 4.1). Au premier lancement, l'app crée une identité privée sur le relais de bouclage. **Disponible.**
3. **Rejoindre.**
   - Aujourd'hui : menu de l'icône, « Ouvrir mon espace… », page « Équipe », « J'ai reçu une invitation », coller le
     lien `https://drop.memolabs.dev/join#…` reçu. La carte dit qui invite, dans quelle équipe, et nomme le relais
     quand « Rejoindre » le ferait changer (D95). Au clic sur « Rejoindre », le poste, qui n'a encore ni pair ni
     équipe, passe sur le relais de l'invitation et y est admis. **Disponible** dans le code et les tests de T4.23,
     mais jamais joué entre de vrais postes (preuves de T4.23, « Non prouvé ici ») : c'est au banc T4.6c de le faire.
   - Parcours visé par D84 : le lien ouvre la page `/join`, qui propose le téléchargement du système, puis le bouton
     « J'ai installé drop : rejoindre l'équipe » rouvre l'app sur la même carte. **Pas encore livré** : page non
     servie par le VPS et aucune release (section 2, T4.31).
4. **Créer l'équipe du binôme** (premier membre seulement). Page « Équipe » : nom de l'équipe, « Créer l'équipe »,
   puis inviter. Mon espace donne le lien `https`, valable 24 h, une seule fois. Le premier membre l'envoie au second
   par la messagerie qu'ils utilisent déjà ; drop ne l'envoie pas. Le panneau de la barre de menus donne encore un
   lien `drop://pair`, inutilisable chez quelqu'un qui n'a pas l'app (T4.31) : passer par Mon espace. Noter si l'envoi
   du lien coince (APP_FLOW, 4.3).
5. **Le second membre** refait les étapes 1 à 3 avec ce lien. Vérifier que chacun voit l'autre dans « Équipe ».
6. **Raccorder ses agents.** Mon espace, « Assistants », « Analyser cet ordinateur », cocher, « Connecter ». Relancer
   chaque agent raccordé. **Disponible** pour les treize clients (T4.22) ; le panneau de la barre de menus ne le
   propose pas encore juste après « Rejoindre » (T4.31).
7. **Partager un outil.** « Outils partagés » : partager au moins un serveur MCP, outils en lecture par défaut.
   Facultatif : « Faits publiés », « Publier un fait ». **Disponible.**
8. **Première question.** Le second membre demande à son agent, en langage courant, une vraie question pour le
   premier (« Demande à Ana où en est la PR du paiement »). L'agent appelle `ask_team`, puis `get_drop_results`. Le
   premier membre reçoit la notification, ouvre la carte, et répond :
   - par « Répondre moi-même », texte ou fichier texte (T4.3). **Disponible** ;
   - par « Autoriser une fois » seulement si un modèle est choisi et que l'essai inclut le partage par modèle. Sans
     modèle, l'exécution échoue (ligne T4.16 de l'index) : prévenir le testeur avant la question.

   **T1** : la réponse s'affiche dans l'agent du second membre. Noter T1 moins T0 pour chacun. Puis inverser les rôles.

Sous Windows et Linux, quand PR #45 sera fusionnée, deux limites connues s'ajoutent, **pas encore livrées** : sans le
plugin `single-instance` (T4.31), un lien `drop://` lance une seconde app au lieu d'atteindre celle qui tourne, donc
coller le lien dans Mon espace ; sous Linux, l'icône n'émet pas de clic et tout passe par son menu (D84).

## 6. Pendant l'essai : observer

Les testeurs travaillent normalement et se posent des questions quand ils en ont besoin. Guillaume ne lit jamais une
question ni une réponse : il n'y a pas accès, et la fiche le promet.

### 6.1 Demandes décidées dans la demi-heure

**Définition.** Parmi les demandes reçues par un membre et soumises à sa décision, la part décidée (« Autoriser une
fois », « Répondre moi-même », « Refuser » ou « Pas maintenant ») dans les 30 minutes qui suivent la réception. Les
faits publiés sont exclus : ils sont servis sans décision.

**Limite du produit à connaître.** Une demande sans décision expire au bout de 10 minutes (`APPROVAL_TTL_MS`,
`packages/node/src/engine.ts`) : le demandeur reçoit `E_EXPIRED` et doit redemander. Aucune décision n'est donc
possible entre 10 et 30 minutes, et la mesure revient à la part des demandes qui n'ont pas expiré. Garder ce délai ou
l'allonger pour l'essai est une question pour Guillaume. L'allonger reste borné : le Node refuse une demande dont
l'identifiant a plus de 30 minutes (`docs/PRIVATE_PROFILE.md`).

**Données.** Chaque Node écrit un reçu signé par demande dans `~/.drop/receipts/AAAA-MM-JJ.jsonl` (`0600`) : les
identifiants des Nodes et de la capacité, des empreintes, la décision et les heures (`requested`, `decided`,
`delivered`). Ni question, ni réponse, ni contenu (`packages/protocol/src/receipt.ts`). L'exécutant envoie le même
reçu au demandeur, qui le garde aussi. À la fin de l'essai, chaque membre relit ses fichiers des jours de l'essai et
les remet à Guillaume, s'il l'a accepté sur la fiche.

**Calcul**, sur le Mac de Guillaume, avec les fichiers des deux membres d'un binôme rangés dans `ana/` et `yan/` :

```sh
cat ana/*.jsonl yan/*.jsonl | jq -s '
  unique_by(.dropId)
  | map(select(.answeredBy != "fact"))
  | {
      demandes: length,
      decidees_30_min: (map(select(.decision != "expired" and .timestamps.decided != null
                                   and .timestamps.decided - .timestamps.requested <= 1800000)) | length),
      expirees: (map(select(.decision == "expired")) | length),
      delais_s: (map(select(.timestamps.decided != null)
                     | (.timestamps.decided - .timestamps.requested) / 1000) | sort)
    }'
```

La part est `decidees_30_min / demandes`. Commande éprouvée sur des reçus fabriqués à la main selon le schéma, pas
encore sur de vrais reçus.

### 6.2 Installation jusqu'à la première réponse

**Définition.** Pour chaque membre, de T0 (il ouvre le message d'invitation) à T1 (la réponse à sa première question
s'affiche dans son agent), section 5. La mesure principale est le chronomètre de la séance : aucun fichier ne connaît
T0.

**Recoupement.** L'heure de création de l'identité marque le premier lancement de l'app, donc après le
téléchargement ; le premier reçu livré marque T1. Chez le testeur, en n'affichant que ces deux champs, car le fichier
contient la clé privée :

```sh
jq -r '.nodeId, .createdAt' ~/.drop/identity.json
```

Puis, sur les reçus remis, avec l'identifiant affiché à la place de `ID_DU_TESTEUR` :

```sh
cat ana/*.jsonl yan/*.jsonl | jq -s --arg moi ID_DU_TESTEUR '
  map(select(.requester == $moi and .timestamps.delivered != null))
  | if length == 0 then "aucune réponse livrée"
    else (min_by(.timestamps.delivered).timestamps.delivered / 1000 | todate) end'
```

L'heure `delivered` vient de l'horloge de l'exécutant, `createdAt` de celle du testeur : quelques secondes d'écart
entre les deux postes sont possibles.

### 6.3 Connexions directes (H5)

**Ce que le produit permet aujourd'hui.** Le Node essaie le réseau local, puis iroh s'il est activé, puis le relais
(`sendInOrder`, `packages/node/src/iroh.ts`). Dans le profil privé, le seul que crée l'app :

- le réseau local (mDNS) est actif par défaut : deux collègues sur le même réseau se joignent directement, si ce
  réseau laisse passer la multidiffusion. **Disponible** (T4.2) ;
- iroh est désactivé par défaut, et le profil privé n'annonce ni ne compose aucune adresse directe hors des plages
  privées (`privateSocket`, `packages/node/src/iroh.ts`) ; le relais de test de n0 y est refusé (D68). Entre deux
  réseaux différents, tout passe donc par le relais de l'essai.

H5 vise environ 90 % de connexions directes par iroh sur Internet : **dans cet essai, en profil privé, ce chiffre
n'est pas mesurable**. Ce qui l'est : la part des échanges de chaque binôme qui n'a jamais traversé le relais, donc
passée par le réseau local.

**Données.** Aucun composant n'enregistre le chemin pris par un envoi. Le relais journalise chaque enveloppe qu'il
voit, sans contenu : identifiant, `from`, `to`, taille et heure (`packages/relay/src/server.ts`). Sur le VPS, en
lecture seule :

```sh
docker logs drop-drop-relay-1 2>&1 | jq -c --arg a ID_A --arg b ID_B '
  select(.event == "envelope" and ((.from == $a and .to == $b) or (.from == $b and .to == $a)))
  | {at, outcome}'
```

Une journée où le binôme a des reçus mais où le relais n'a vu aucune enveloppe entre eux est une journée sans relais.
Les autres cas ne se tranchent pas : une demande, sa décision et sa réponse peuvent prendre des chemins différents.
C'est une approximation. La mesure exacte demande que le Node note, sans contenu, le chemin de chaque envoi livré
(réseau local, iroh, relais) : ligne `todo` proposée à Guillaume.

### 6.4 Journal d'observation

Une ligne par fait observé : date, binôme, ce qui s'est passé, ce que le testeur a fait, et la ligne `todo` qu'il
devient dans [`docs/TASKS.md`](../TASKS.md). Les hypothèses des parcours à confirmer ou infirmer :

| Hypothèse                                                        | Source        | Observation                          |
| ---------------------------------------------------------------- | ------------- | ------------------------------------ |
| Le testeur trouve l'icône de la barre de menus seul              | APP_FLOW, 4.1 | séance d'installation                |
| Envoyer le lien d'invitation par sa messagerie ne coince pas     | APP_FLOW, 4.3 | séance d'installation                |
| Décider prend quelques secondes, sans vocabulaire technique      | UX_UI, 8      | délais de 6.1, point d'étape         |
| Répondre à la main prend moins d'une minute                      | APP_FLOW, 4.6 | point d'étape, demandé au testeur    |
| La liste des outils partagés se trouve sans aide                 | UX_UI         | séance d'installation                |
| Un fait publié évite des décisions sur les questions répétitives | APP_FLOW, 4.7 | part des reçus `answeredBy: "fact"` |
| Chaque écran principal est compris                               | UX_UI         | point d'étape et entretien de fin    |

Relever aussi : chaque refus et sa raison, si le testeur veut bien la donner ; chaque `E_EXPIRED` ; chaque état
« hors ligne » qui dure ; chaque fois qu'un testeur est revenu à sa messagerie ou à un partage d'accès à la place de
drop.

**Quand quelque chose casse chez un testeur** (T4.37) : il ouvre Mon espace, « Diagnostic », « Préparer le
diagnostic », le relit, puis « Copier le diagnostic » et le colle dans sa messagerie. drop n'envoie rien. Le texte donne
les versions, le système, l'état des connexions et la fin des journaux, expurgés : ni clé, ni jeton, ni contenu de
demande. Si le moteur ne démarre plus, la page de démarrage donne le chemin du journal et ouvre le dossier
`~/.drop/logs`, qui ne contient que des journaux expurgés à l'écriture : le testeur les relit avant de les envoyer, l'expurgation ne reconnaissant pas tout. Ne jamais demander le dossier
`~/.drop` entier, qui contient sa clé privée.

### 6.5 Rendez-vous

Proposition, à confirmer par Guillaume :

- **Jour 1** : séance d'installation (section 5), environ 45 minutes par binôme.
- **Milieu de l'essai** : point de 15 minutes par testeur. Ce qui a servi, ce qui a coincé, la version installée.
- **Fin** : entretien de 30 minutes par testeur, puis remise des reçus relus (6.1) et désinstallation (section 8)
  s'il ne garde pas drop.

## 7. Livrer une correction pendant l'essai

**Signaler.** Le testeur prévient Guillaume par le canal qu'ils utilisent déjà. Le dépôt est public : une issue
GitHub ne contient jamais de donnée de travail du testeur ; Guillaume la rédige lui-même, sans contenu. Une faille
passe par le signalement privé de GitHub (`SECURITY.md`, D86).

**Relais.** **Disponible** (D91) : une correction fusionnée sur `main` part en image sur GHCR, que l'autodeploy du VPS
installe. Vérifier que `build` dans `/health` est le commit attendu. Après un redémarrage du relais, le Node d'un
poste peut rester bloqué sans se reconnecter (observé en T4.6a, à corriger en T3.1f) : si un testeur reste « hors
ligne », lui faire quitter drop (« Quitter drop » dans le menu de l'icône) et le relancer.

**App.** Mise à jour à la main, **Disponible** ([`docs/MAC_RELEASE.md`](../MAC_RELEASE.md)) :

1. monter `version` dans `apps/desktop/src-tauri/tauri.conf.json`, construire une release signée et notarisée ;
2. envoyer au testeur le DMG et son manifeste ; il compare le SHA-256 et vérifie la signature (section 4, étape 2) ;
3. quitter drop, sauvegarder `~/.drop` daemon arrêté, remplacer l'app dans `/Applications`, relancer ;
4. noter dans le journal la version installée chez chaque testeur.

Les mises à jour signées automatiques (D70) ne sont **pas encore livrées** : la clé de mise à jour n'existe pas
(`apps/desktop/updater.pub` absent) et rien n'est publié sous `https://drop.memolabs.dev/updates/`. Les activer pour
l'essai est une question pour Guillaume.

**Jamais de retour à une version antérieure avec la même identité** une fois des demandes reçues (anti-rejeu de
T3.1b, `docs/MAC_RELEASE.md`, « Retour arrière ») : revenir en arrière veut dire une nouvelle identité, donc
supprimer `~/.drop`, et une nouvelle invitation.

## 8. Fin de l'essai : tout retirer

Chez le testeur, s'il ne garde pas drop, dans cet ordre :

1. **Remettre les reçus** s'il l'a accepté (6.1), avant de supprimer quoi que ce soit.
2. **Retirer drop de ses agents.** Mon espace, « Assistants », « Retirer » puis « Déconnecter » pour chaque agent.
   Seule l'entrée de drop est retirée, le reste de la configuration de l'agent ne bouge pas
   ([`docs/ONBOARDING.md`](../ONBOARDING.md)). Relancer les agents.
3. **Quitter drop** : menu de l'icône, « Quitter drop ».
4. **Supprimer l'app** : `/Applications/drop.app`.
5. **Retirer le démarrage automatique** s'il reste : dans Réglages Système, Général, la liste des éléments ouverts à
   l'ouverture de session, ou en supprimant `~/Library/LaunchAgents/drop.plist`. Ce nom est déduit du code (plugin
   `autostart` de Tauri, qui prend le `productName` « drop », `main.rs`) : à vérifier sur un vrai Mac.
6. **Supprimer `~/.drop`** : identité et clé privée, pairs, équipe, reçus, faits, marqueurs anti-rejeu, journaux
   (`logs/daemon.log` et ses fichiers précédents, `logs/app.log`) et sauvegardes des configurations d'agents (`~/.drop/backups/`).
7. **Révoquer les jetons** qu'il avait créés pour ses serveurs MCP (GitHub, Linear…) s'il n'en a plus besoin. drop
   n'en crée aucun : ils appartiennent à la configuration de ses agents.

Chez Guillaume :

8. **Révoquer les postes sur le relais**, appliqué en quelques secondes grâce à `revokedPath` (D91) ; `--with-invited`
   retire aussi le second membre, parrainé par le premier. Avec l'image construite par le `Dockerfile` du dépôt :
   `docker exec drop-drop-relay-1 node packages/relay/src/cli.ts revoke ID_DU_PREMIER_MEMBRE --with-invited --config=/config/relay.config.json`.
9. **Son Node d'admission.** Aucun retrait de pair n'existe (D67) : le testeur reste listé « hors ligne » chez lui.
   Si c'était un Node dédié à l'admission, supprimer son dossier.
10. **Supprimer les données de l'essai** au terme promis sur la fiche : reçus remis, extraits du journal du relais,
    feuilles de chronométrage, notes d'entretien.

## 9. Après l'essai

- Comparer chaque mesure au seuil proposé du PRD, section 7 : tenu, raté ou non mesuré, avec la raison.
- Ajouter le compte rendu à [`docs/AVANCEMENT.md`](../AVANCEMENT.md), sans aucune donnée de travail des testeurs.
- Chaque friction du journal devient une ligne `todo` de [`docs/TASKS.md`](../TASKS.md), ou une raison écrite de ne
  pas la traiter.
- Une capture ne sert au site que si le testeur l'a accepté sur la fiche, floutée, et jamais avec une donnée de son
  entreprise.
