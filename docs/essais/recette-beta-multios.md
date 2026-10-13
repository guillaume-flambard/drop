# Drop — recette bêta privée multi-OS (T4.6c)

**État : à exécuter sur les vrais appareils ; aucune recette physique encore validée.**
Ce document prépare les essais, il ne constitue pas une attestation de conformité. Référence des parcours :
[`README.md`](README.md) ; critères de sortie : [`docs/ACCEPTANCE.md`](../ACCEPTANCE.md) ;
distribution : [`docs/BETA_DISTRIBUTION.md`](../BETA_DISTRIBUTION.md).

## Préconditions et limites connues

- Version d'essai préparée : **`v0.1.0-ci.36`**, *release GitHub brouillon et préversion*.
  Les cinq artefacts ont été vérifiés par SHA-256 sur le Mac et sur le VPS, **pas installés physiquement**
  sur chaque OS. Aucun tag stable n'est publié.
- Distribution privée : le propriétaire génère son invitation dans Drop. Un lien combiné
  `/beta/<expiration>/<signature>#<invitation>` ouvre la page, puis permet de télécharger l'installateur.
  Le téléchargement et l'invitation expirent **indépendamment** : capacité bêta temporaire et
  invitation d'équipe **24 h, une seule utilisation**. La capacité de la campagne actuelle expire
  le **19 octobre 2026** : régénérer une capacité expirée avant de commencer.
- Une personne qui reçoit la capacité bêta peut la transférer pendant sa validité. **Ne jamais**
  afficher cette URL complète, le fragment `#<invitation>`, des jetons, clés, noms de fichiers
  privés ou données professionnelles dans les tickets publics ou les captures.
- **macOS ARM64** : notarisation et Gatekeeper validés sur la build préparée ; il reste à installer
  sur un Mac propre. L'artefact **Intel** existe, mais sa recette de notarisation/installation n'est
  pas établie ici.
- **Windows 10/11 x64** : installeur `.exe` disponible ; **pas de signature Authenticode**
  (issue [#93](https://github.com/memolabs-dev/drop/issues/93)). Si Windows signale un blocage de
  sécurité, noter le message et classer le test `BLOQUÉ` : ne pas demander de contourner l'alerte.
- **Linux x64 / ARM64** : AppImage disponible ; comportement GNOME/KDE et X11/Wayland non encore
  testé sur machine réelle. Vérifier les bibliothèques système et l'enregistrement de `drop://`.

## Matrice d'essai à renseigner (sans identification personnelle)

| ID | Plateforme | Version de l'OS / environnement | Installé | Ouvre `drop://join` | Équipe visible | Redémarrage OK | Résultat |
| --- | --- | --- | --- | --- | --- | --- | --- |
| M1 | macOS Apple Silicon | à noter | non testé | non testé | non testé | non testé | À faire |
| M2 | macOS Intel (si disponible) | à noter | non testé | non testé | non testé | non testé | À faire |
| W1 | Windows 10 x64 | à noter | non testé | non testé | non testé | non testé | À faire |
| W2 | Windows 11 x64 | à noter | non testé | non testé | non testé | non testé | À faire |
| L1 | Linux x64 GNOME / X11 ou Wayland | à noter | non testé | non testé | non testé | non testé | À faire |
| L2 | Linux x64 KDE / X11 ou Wayland | à noter | non testé | non testé | non testé | non testé | À faire |
| L3 | Linux ARM64 (si disponible) | à noter | non testé | non testé | non testé | non testé | À faire |

Statuts autorisés pour les colonnes : `PASS`, `ÉCHEC`, `BLOQUÉ`, `NON TESTÉ`.
**Ne pas confondre** un test compilé en CI et une installation réussie.

## Parcours à effectuer pour chaque système

1. **Avant installation** : noter l'OS, la version, l'architecture, le bureau et si Drop est déjà
   installé. Pour une première installation, utiliser un profil ou poste de test sans données
   sensibles. Vérifier qu'il s'agit bien de l'artefact correspondant à la plateforme.
2. **Installer depuis une invitation** : ouvrir le lien privé reçu, choisir l'installateur de
   la plateforme ; vérifier que le téléchargement commence, que l'application se lance et que
   la page conserve l'invitation après l'installation. Noter les avertissements du système sans
   neutraliser les protections.
3. **Rejoindre explicitement** : après le lancement, ouvrir le lien `drop://join` depuis la page
   d'invitation. Vérifier que l'application montre **qui invite, l'équipe et le relais** avant
   que le bouton « Rejoindre » soit validé. Aucun consentement implicite.
4. **Équipe visible des deux côtés** : sur le poste invitant et sur le nouveau poste, vérifier
   les deux membres et la persistance après fermeture/réouverture de Drop. Vérifier aussi que
   relancer la même invitation ne permet pas de rejoindre une deuxième fois.
5. **Sans tunnel de développement** : mettre les machines sur **deux réseaux réellement différents**
   si possible et vérifier la connexion par le relais prévu, sans tunnel SSH expérimental.
   Noter explicitement si le test n'était réalisable que sur le même réseau.
6. **Premier échange contrôlé** : publier un fait de test non sensible ou demander une réponse
   manuelle ; accepter une demande, puis en refuser une autre. Vérifier que la réponse autorisée
   et le refus ont des états clairs. **Ne pas** brancher des agents ou partager des fichiers
   réels sans un accord séparé du propriétaire.
7. **Reprise et erreurs** : fermer puis relancer la coque, constater la conservation de
   l'identité et de l'équipe ; relever les codes d'erreur en cas de relais indisponible.
   Vérifier l'affichage en petites et grandes fenêtres et les interactions clavier.
8. **Remontée d'anomalie** : noter uniquement le scénario, les étapes reproductibles, l'OS,
   la version, le code d'erreur et les **journaux expurgés**. Retirer les invitations, jetons,
   noms de postes, chemins personnels et contenus professionnels avant partage.

## Critères de sortie

**PASS global** seulement si les deux appareils prévus rejoignent une même équipe, traversent
leurs réseaux réels, échangent une réponse autorisée, supportent un refus et conservent
leurs identités après redémarrage. Les plateformes non disponibles restent `NON TESTÉ`,
jamais `PASS`. La signature Windows, le test macOS propre, les mises à jour N→N+1 et les recettes
GNOME/KDE peuvent rester des bloqueurs de release publique même si la bêta privée fonctionne.

La release stable reste en brouillon. Les preuves de la recette alimentent
[l'issue de sortie bêta #87](https://github.com/memolabs-dev/drop/issues/87)
**sans divulgation de secrets ni de liens privés**.
