## Contexte

Le panneau de la barre de menus est une page servie par le Node sur `127.0.0.1` et affichée par la coque Tauri dans une fenêtre de 380 × 620. La fenêtre « Ton espace » (D87, D88) a déjà sa chaîne de construction : esbuild et Tailwind 4 compilent `packages/desktop-ui`, le résultat est écrit compressé dans `packages/node/src/workspace-assets.generated.ts`, et la CI vérifie qu'il correspond aux sources (`--check`).

## Décisions

1. **Une seconde entrée, une seule feuille de style.** `src/panel/main.tsx` est compilé en un second bundle IIFE ; la feuille Tailwind reste unique (les deux pages partagent jetons et composants). Le module généré exporte `panelJsGzipBase64` en plus ; la porte `--check` compare aussi ce bundle décodé.
2. **Même service que la fenêtre.** `workspace.ts` rend les deux pages avec une fonction commune et calcule une CSP par page (`strictCsp`), dont l'empreinte est celle du script effectivement servi (après échappement de `</script`). `/app` garde son contrôle de jeton.
3. **Logique pure séparée.** `src/panel/logic.ts` regroupe textes, codes traduits (`explain`), coût, compte à rebours, états des questions envoyées, formulaire de relecture, limites de la réponse humaine, avertissements de liaison et lien de connexion https seul. Les composants l'appellent ; les tests l'appellent directement.
4. **État conservé entre onglets.** Les trois `TabsContent` restent montés (`forceMount`, masqués par `data-state`), si bien que brouillons de réponse, analyse et fait en cours d'écriture survivent aux changements d'onglet comme aux rafraîchissements en direct, sans variable globale.
5. **Rafraîchissement en direct.** Le flux SSE recharge demandes, badge et état d'en-tête, quel que soit l'onglet ; si le focus est dans un champ du panneau, le rechargement attend que le focus le quitte.
6. **Focus.** Après une action, le bandeau de résultat prend le focus ; une région vivante cachée l'annonce. Les déplacements précis (zone de réponse, « Envoyer », « Retirer » d'un fichier…) passent par `data-focus`. Sans focus, « Pas maintenant » de la première carte le prend ; jamais « Autoriser ».
7. **Texte des pairs.** Tout passe par le rendu texte de React. Aucun `dangerouslySetInnerHTML` ni `innerHTML` dans `src/panel` (vérifié par test).
8. **Tests.** happy-dom (D97) rend les vrais composants ; un `fetch` remplacé joue le Node. Les tests HTTP et CSP restent dans `packages/node/test/panel.test.ts`.

## Parité avec l'ancien panneau

| Ancien `panel.ts` | Panneau React |
| --- | --- |
| En-tête « drop », état « Connexion… », « Prénom · connecté / hors ligne », « Moteur local indisponible » en région polie, bordure au défilement | Repris (`PanelApp.tsx`, `connectionStatus`) |
| Onglets Demandes, Équipe, Mes outils, flèches, Début, Fin, badge | Radix Tabs ; badge avec texte caché « en attente » |
| « À décider », état vide | « Tout est à jour » avec la même phrase |
| Carte : demandeur, agent, titre, question, pourquoi, recevra, ne recevra jamais, coût, sensibilité haute, « Expire dans » qui décompte | Reprise ; en-tête au libellé de la spec node, « a besoin d’aide » |
| Pas maintenant (défaut clavier), Refuser, Autoriser une fois, noms accessibles avec le titre, arrivée et départ animés | Repris ; animations coupées par « réduire les animations » |
| Répondre moi-même : texte (8 000), compteur, destinataire réel, fichier texte 128 Kio, UTF-8 exigé, retrait du fichier, Annuler, relecture exacte avec contenu du fichier, Modifier, Envoyer seul appelle `/ui/answer`, limite de corps, code traduit, brouillon gardé | Repris (`Composer`) |
| Relecture : case « Retirer » par champ, Ne pas envoyer, Envoyer avec `redact` | Repris ; un champ retiré est barré |
| « Mes questions » : dix dernières, état coloré, détail dépliable vrai, dépliage conservé | Repris (`details` natif) |
| Équipe : création avec validation, membres, « (toi) », agents, outils, en ligne | Repris |
| Invitation : lien 24 h, « Copier le lien », échec de copie en alerte | Repris ; presse-papiers absent compté comme échec |
| Connexion OAuth proposée après `E_SHARE_OAUTH`, lien https seul | Repris en tête de « Mes outils » |
| Ce que je publie : liste, vide, erreur de lecture, ajout, modification (durée gardée), retrait, grisé avec état, public choisi | Repris |
| Connecter mes agents : deux étapes, « 1. Analyser cet ordinateur », cases, détail traduit, secours dépliable, « Retirer ce connecteur », « 2. Connecter… », message par agent et relance, vide, voie manuelle | Repris ; retrait confirmé dans un Dialog |
| Projets : sources, retrait d'un dossier ajouté, clients du dossier, ajout validé | Repris |
| Mes outils : interrupteurs Partager / Ne plus partager | Switch Radix (`role="switch"`) |
| Assistants reliés et Retirer, qui paie le modèle | Repris ; le retrait confirme par un bandeau |
| Connexion par Internet : états, message d'échec, quatre choix, adresse validée, Enregistrer | Repris |
| `drop://pair` et `drop://join` : aperçu, Refuser par défaut, Rejoindre seul appaire, puis Équipe ; relais nommé quand « Rejoindre » le ferait changer (`relay: 'adopt'`) ; chaque refus avec le message de son code stable (revue de T4.23, D95) | Repris ; porté le 12 octobre 2026 à la fusion de `main`, refus affiché par `failureText` (message du Node suivi du code) |
| `drop://link` : passerelle inconnue, lien incomplet, domaine inconnu, Autoriser seulement si complet | Repris ; Refuser prend le focus |
| Paramètres de lien retirés de l'adresse, jeton gardé | Repris (`history.replaceState`) |
| Chargement (blocs, « Chargement… », `aria-busy`), erreur avec Réessayer, refus en alerte, boutons inactifs pendant l'appel | Repris |
| Thèmes clair et sombre, réduire les animations, réduire la transparence, augmenter le contraste, focus de 2 px | Repris dans `styles.css` (`html.drop-panel`) |

## Risques

- **Rendu réel des web views** : happy-dom et Chromium ne prouvent pas WKWebView, WebView2 ni WebKitGTK (`color-mix`, `backdrop-filter`, `:focus-visible`). Reste à la seconde partie de T4.24.
- **Poids** : le bundle du panneau pèse environ 390 Ko non compressé, embarqué compressé. Accepté pour une page locale.
