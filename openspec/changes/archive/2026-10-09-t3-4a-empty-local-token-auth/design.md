# Design

## Context

Voir [proposal.md](proposal.md). Aujourd'hui, `DropHome.localToken()` peut renvoyer une chaîne vide. `startLocalApi()` la conserve comme secret attendu, et la comparaison accepte deux chaînes vides. `startDaemon()` démarre le relais avant de lire le jeton pour l'API.

## Goals / Non-Goals

**Goals:** échouer fermé avant toute connexion ou écoute quand le fichier local est invalide ; rejeter une présentation vide à la frontière HTTP même si un appelant contourne le démarrage normal ; conserver le parcours valide.

**Non-Goals:** régénération implicite ou rotation du jeton, nouveau mécanisme d'authentification, modification des exceptions publiques A2A/sonde Mac.

## Decisions

- `DropHome.localToken()` refuse un fichier manquant, vide ou blanc avec `E_TOKEN`, sans inclure sa valeur ni le chemin dans l'erreur. La restauration de l'identité et du jeton reste une action explicite.
- `startDaemon()` lit ce jeton une fois avant de construire ou démarrer le relais, puis réutilise la même valeur pour l'API et les deux URLs locales. Cela évite des lectures divergentes si le fichier change au milieu du démarrage.
- `startLocalApi()` refuse aussi un jeton attendu vide avant de créer un listener ; la comparaison à temps constant refuse toute valeur présentée vide avant `timingSafeEqual`. Ce second contrôle protège les appels directs et les régressions futures.
- Les tests couvrent un profil temporaire réel et les routes API, UI et SSE sur loopback. Aucune dépendance supplémentaire.

## Risks / Trade-offs

- Un état local corrompu ne démarre plus en mode dégradé : c'est le comportement sûr. L'utilisateur restaure le fichier d'une sauvegarde cohérente ou réinitialise volontairement son identité.
- Changer le fichier après le démarrage n'invalide pas le jeton déjà chargé en mémoire ; la rotation à chaud reste hors périmètre. La propriété visée ici est l'absence d'authentification par valeur vide et un démarrage cohérent.

## Migration Plan

Aucune migration de format. Les installations avec jeton valide ne changent pas. Une installation avec jeton absent ou vide échoue explicitement au lieu de servir une API accessible sans secret.
