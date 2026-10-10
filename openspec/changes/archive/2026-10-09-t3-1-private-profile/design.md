# Design

## Context

Le client LLM emploie fetch et permet à funding de remplacer URL/modèle. MCP et A2A acceptent un fetch injectable. Le relais ws ne suit pas les redirections par défaut. Les appels des processus stdio ou docker sont hors portée d’un filtre JavaScript.

## Goals / Non-Goals

Réaliser AC-PRIVATE-01 à 08. Les recettes portent sur le runtime privé, pas la distribution signée ni la qualification d’un vrai modèle.

## Decisions

- Politique par origine exacte, adresses IPv4 privées ou loopback et IPv6 loopback/ULA. Pour cette première version, les noms DNS sont refusés : aucune résolution mutable ni rebinding. Les noms et TLS avec DNS nécessiteront une évolution explicite ; les certificats IP restent possibles.
- Fetch privé : pas de proxy implicite, pas de redirection, origine secondaire identique à la source. Une politique d’hôte interdit les sorties Internet des sources et processus tiers. Stdio et lectures docker/journald sont refusés dans le profil privé tant qu’aucune isolation de processus vérifiable n’est fournie ; HTTP interne et fichiers locaux restent utilisables.
- Aucun SDK nouveau. Schéma et validation d’adresse pure dans protocol ; transport dans capabilities, appliqué aux points d’entrée Node, découverte incluse.
- Financement : correspondance exacte URL normalisée et modèle, sinon E_DENIED avant usage. Aucun secret dans l’erreur.
- Anciennes configurations conservées ; migration config seule, sauvegarde exclusive, remplacement atomique, retour arrière avec détection de divergence. Publications anciennes conservées mais une destination hors politique échoue sans appel.
- Révocation au redémarrage comme l’admission administrative existante ; conserve les nonces consommés.
- Preuve isolée Docker sur réseau sans sortie, fixtures internes, journal des requêtes et capture réseau dans l’espace réseau du conteneur. Aucun secret réel.

## Risks / Trade-offs

- Source interne capable d’exfiltrer → politique de l’hôte et preuve du périmètre ; pas de promesse de sandbox universelle.
- Config historique implicite cloud → migration explicite et documentation, pas d’effacement des publications.
- Restriction IP/stdio → erreur explicite, raccordement HTTP interne ; ne pas déclarer tous les agents compatibles.
- Redémarrage et rejeu → tests existants plus tests d’intégration de reprise.
- Capture incomplète → préciser interfaces et composants observés, ne pas déclarer AC validé sans preuve.

## Migration Plan

Arrêter le daemon, sauvegarder, migrer vers la politique interne choisie, démarrer et tester. Retour arrière explicite uniquement si le fichier migré n’a pas été modifié. Aucun changement du lab, aucun déploiement externe.
