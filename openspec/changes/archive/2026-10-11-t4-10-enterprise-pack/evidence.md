# Preuves T4.10

| Critère | Preuve |
|---|---|
| Politique signée, vérifiée, inaltérable | Test « enterprise policy (T4.10) > signs a policy, verifies it against its issuer and refuses any change ». Signature acceptée par son émetteur, refusée pour un autre, pour une politique élargie après signature, pour une signature d'une autre clé qui se dit de l'organisation, pour un document illisible (refus, jamais d'exception). L'empreinte change avec la version et avec la signature. Validité : cinq minutes de décalage d'horloge tolérées avant l'émission, refus à l'expiration. |
| Le Node refuse de démarrer | Test « … > refuses to start on a policy that is tampered with, from another issuer or expired ». Politique altérée, d'un autre émetteur, expirée, sans `issuer.pub`, `issuer.pub` sans politique : `E_POLICY`. Une politique système l'emporte toujours sur `DROP_POLICY_DIR` ; `ProgramData` ne déplace pas le dossier Windows. Le daemon refuse de démarrer, aussi avec un financement OpenRouter hors `allowedProviders`. |
| Application de la politique | Test « … > applies the policy to the relay, direct paths, gateways, clients and models ». Un autre relais que celui de l'organisation : refus au démarrage. Avec le bon : connexion au relais interne, réseau local et iroh éteints, mode internet refusé (`E_POLICY`), liaison d'une passerelle refusée, aperçu d'onboarding filtré aux clients permis et sans configuration manuelle, connexion d'un client non permis refusée mais retrait permis, `drop install cursor` refusé sans rien écrire, statut qui montre la politique, modèle hors des origines permises refusé avant tout appel, redirection 307 d'un fournisseur non suivie (le second serveur n'est jamais touché), passerelle non permise absente des liens et son `agent_call` ignoré. Sans `requireInternalRelay` : relais iroh tiers refusé ; quand la politique expire (3 s), le relais est coupé et le mode Internet refusé. |
| Le relais n'admet que les nœuds gérés | Test « … > lets in only nodes that present the relay's policy ». Nœud avec la bonne empreinte admis ; sans empreinte ou avec celle d'une autre politique : refus 4401 avant toute admission. Le relais ne démarre ni sur une politique falsifiée, ni sur une config à moitié, ni sur une politique déjà expirée. Une fois la politique expirée (horloge injectée), un nœud qui arrive est refusé à l'authentification et un nœud connecté est coupé au ping suivant. |
| TLS natif | Test « … > serves wss itself when given a certificate ». Certificat éphémère généré par openssl dans un dossier 0700 ; le relais sert `wss://` et `/health` en HTTPS. |
| Chart Helm durci | Test « … > renders a hardened single-replica Helm chart for the relay », lancé avec Kubernetes Helm 4.3.0 (`HELM_BIN=/opt/homebrew/bin/helm`, installé par Homebrew). `helm lint --strict` passe ; une réplique, `Recreate`, `runAsNonRoot`, système de fichiers racine en lecture seule, pas d'élévation de privilèges, capacités retirées, seccomp `RuntimeDefault`, pas de jeton de compte de service, PVC, politique montée, sondes HTTPS quand TLS, ingress refusé sans secret TLS, politique refusée sans émetteur, somme de contrôle du pod qui change avec la politique, ingress en HTTPS vers un relais TLS. Le test s'ignore lui-même quand Helm 3 ou 4 est absent : la CI ne l'exécute pas (suivi en T4.10c). |

Vérification : voir la fin de ce fichier.

## Image Docker, essai réel

`docker build -f docker/relay.Dockerfile -t drop-relay:t4-10 .` (refaite après les correctifs de revue, `sha256:77879fb1…`), image de 350 Mo sur `node:24-slim` épinglé par digest, utilisateur `node`. Lancée avec `--read-only --cap-drop ALL --security-opt no-new-privileges`, configuration et politique montées en lecture seule, `/data` en écriture :

```
1. health: 200
2. managed node: true | unmanaged node: false (unauthorized)
3. user: 1000 | root fs writable: no
4. logs: ok, policy_mismatch, policy_mismatch, ...
```

Le nœud non géré réessaie avec son délai minimal de 50 ms dans l'essai ; chaque tentative est refusée avant toute admission.

## Mutation

39 protections retirées une à une, 39 tuées. Protocole : signature et émetteur dans `verifyPolicy`, signature dans l'empreinte, émission dans le futur. Relais : empreinte, expiration à l'authentification, coupure à l'expiration, démarrage sur politique falsifiée, déjà expirée ou config à moitié. Node : relais permis, réseau local, mode internet, relais iroh (daemon et `irohRelayPermitted`), expiration en cours de route (daemon et mode internet), financement, aperçu, configuration manuelle, connexion et retrait à l'onboarding, `drop install`, liaison de passerelle, filtrage des liens, drapeau `allowed`, garde du modèle, comparaison des origines, redirection du modèle, priorité du dossier système, dossier Windows, `issuer.pub` seul, expiration au chargement, empreinte présentée. Chart : somme de contrôle, émetteur requis, ingress HTTPS, réplica unique, racine en lecture seule. Une première mutation du préfixe de domaine de la signature survivait : elle est équivalente (signature et vérification partagent la constante) et a été remplacée. Non tuée faute de test : le passage de `allowModel` par le daemon aux capacités (suivi en T4.10c).

## Revue

Revue adverse indépendante : 3 défauts hauts, 6 moyens, 5 faibles, plus 3 tests trop faibles. Corrigés : dossier Windows lu dans l'environnement (haut), `drop install` hors politique (haut), rotation de politique par Helm qui laissait l'ancienne au relais et enfermait les postes à jour (haut), connexions gardées après expiration, relais iroh tiers sans `requireInternalRelay`, financement hors `allowedProviders`, redirection suivie par l'appel de modèle, config de relais à moitié, chemins TLS non résolus, retrait d'un client refusé, configuration manuelle proposée, passerelle hors politique encore pair connu, relais démarré sur une politique expirée, ingress en HTTP vers un relais TLS, `issuer.pub` seul. Tests renforcés : expiration avec connexion ouverte, iroh testé par un refus réel et non par l'état par défaut. Restent, suivis en T4.10c : certificat TLS et politique relus seulement au démarrage (le chart redémarre le pod à chaque politique), Helm absent de la CI, garde du modèle non prouvée à travers le daemon.

## /cso

Run `1791673738602-676de85f04dbff05`, statut `partial` uniquement parce que l'outil ne lit pas les fichiers binaires (icônes, captures). Couverture enregistrée sur douze domaines, aucun constat. Le run a précédé la revue adverse ; ses correctifs ne font que resserrer les mêmes frontières.

## Vérification finale

Après les correctifs de revue : `pnpm -r lint` et `pnpm -r typecheck` propres ; `HELM_BIN=/opt/homebrew/bin/helm pnpm -r test` : 68 fichiers, 513 tests, aucun ignoré ; `openspec validate --all --strict` : 22 éléments valides ; openspec-guard : 378 critères liés par sélecteur, baseline inchangée.
