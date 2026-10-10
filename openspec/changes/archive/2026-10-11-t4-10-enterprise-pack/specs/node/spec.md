## ADDED Requirements

### Requirement: Politique d'entreprise lue au démarrage
Une politique déposée dans le dossier système, à chemin fixe, avec la clé de son émetteur SHALL être lue au démarrage ; invalide, d'un autre émetteur, expirée, ou un financement hors `allowedProviders`, le daemon MUST refuser de démarrer avec `E_POLICY`.

#### Scenario: AC: politique invalide, démarrage refusé
<!-- openspec-guard:test="enterprise policy (T4.10) > refuses to start on a policy that is tampered with, from another issuer or expired" -->
- **WHEN** la politique déposée est modifiée après signature, signée par un autre émetteur ou expirée
- **THEN** le démarrage échoue avec `E_POLICY`, comme sans `policy.json` à côté de `issuer.pub` ou avec un financement hors liste, et une variable d'environnement ne remplace ni ne déplace une politique système

### Requirement: Politique d'entreprise appliquée au poste
Le Node MUST borner le relais aux `relays`, couper réseau local et iroh si `requireInternalRelay`, n'accepter un relais iroh que sur l'hôte d'un relais listé, refuser les passerelles non permises même liées avant, les clients hors liste et un modèle hors `allowedProviders`, et présenter l'empreinte au relais. À l'expiration, il MUST couper ses voies vers l'équipe. Un appel de modèle MUST ne jamais suivre de redirection.

#### Scenario: AC: politique appliquée
<!-- openspec-guard:test="enterprise policy (T4.10) > applies the policy to the relay, direct paths, gateways, clients and models" -->
- **WHEN** une politique valide exige le relais interne, interdit les passerelles, permet deux clients et un fournisseur
- **THEN** un autre relais est refusé, réseau local et iroh sont coupés, une liaison d'assistant est refusée et une passerelle déjà liée n'est plus entendue, seuls les deux clients sont proposés ou installés (le retrait reste possible), un modèle hors liste est refusé avant tout appel et une redirection n'est pas suivie, l'état affiche la politique ; sans `requireInternalRelay`, un relais iroh tiers est refusé, et à l'expiration le relais est coupé et le mode Internet refusé
