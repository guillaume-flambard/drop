# Spec Delta

## ADDED Requirements

### Requirement: Distribution Mac autonome
L’app Mac SHALL être livrée avec le moteur Node et les ressources nécessaires à son fonctionnement, sans Node développeur installé. Chaque paquet public SHALL indiquer version et architecture, être signé et notarisé avant distribution ; une construction non qualifiée MUST NOT être présentée comme une version distribuable.

#### Scenario: AC: AC-MAC-01 — installation autonome vérifiée
<!-- openspec-guard:non-testable reason="Recette manuelle d'installation d'un DMG signé/notarisé sur un Mac propre ; le build de développement ne suffit pas." -->
- **WHEN** une personne installe le paquet qualifié sur un Mac propre de l’architecture annoncée
- **THEN** elle peut ouvrir l’app, initialiser son identité privée et traiter une demande de consentement sans installer Node ni ouvrir un terminal

### Requirement: Parcours de consentement accessible
Le panneau SHALL permettre la navigation, la sélection, l’accord, le refus et l’annulation au clavier et avec VoiceOver. Il SHALL garder un ordre de focus prévisible après les mises à jour et annoncer les états importants sans annoncer le contenu sensible d’une demande hors du panneau.

#### Scenario: AC: AC-MAC-02 — décision au clavier et avec VoiceOver
<!-- openspec-guard:non-testable reason="Recette manuelle clavier et VoiceOver sur le WebView Mac ; l'inspection du DOM seule ne prouve pas VoiceOver." -->
- **WHEN** le propriétaire ouvre une demande puis choisit autoriser, refuser ou reporter au clavier ou avec VoiceOver
- **THEN** chaque commande possède un nom et un état lisibles, le focus reste utilisable et le résultat de l’action est annoncé

### Requirement: Cycle de vie borné du daemon
La coque Mac SHALL distinguer son propre Node d’un service présent sur le port local et SHALL afficher une erreur récupérable si le bootstrap ou le daemon échoue. Après veille ou panne, elle SHALL tenter une reprise bornée sans lancer deux instances, sans écouter sur une interface publique et sans masquer une panne persistante.

#### Scenario: AC: AC-MAC-03 — panne, veille et port occupé
<!-- openspec-guard:non-testable reason="Recette système Mac de veille, panne du processus et collision de port ; tests unitaires de sonde complémentaires." -->
- **WHEN** le Mac reprend après veille, le Node s’arrête ou le port local est occupé
- **THEN** l’app vérifie la santé de son Node, redémarre au plus dans sa borne prévue ou affiche un problème et une action Réessayer, sans naviguer vers un autre service

### Requirement: Mise à jour Mac facultative et vérifiée
L’usage courant de l’app SHALL fonctionner sans réseau de mise à jour. Une mise à jour MUST être facultative et son paquet MUST être vérifié avant installation. Un refus, une panne réseau ou un paquet invalide SHALL conserver la version installée et offrir une procédure de retour à la version précédente.

#### Scenario: AC: AC-MAC-04 — mise à jour refusée, hors ligne ou invalide
<!-- openspec-guard:non-testable reason="Recette manuelle de paquet Mac invalide et retour arrière ; aucune publication ou installation automatisée en CI." -->
- **WHEN** l’utilisateur refuse la mise à jour, travaille sans Internet ou reçoit un paquet non valide
- **THEN** l’app installée continue de fonctionner, le paquet non valide n’est pas exécuté et la procédure de provenance et de retour arrière est disponible
