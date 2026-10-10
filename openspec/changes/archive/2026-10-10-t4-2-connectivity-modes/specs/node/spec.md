## ADDED Requirements

### Requirement: Découverte sur le réseau local
En mode local actif, le Node SHALL annoncer le service `_drop._tcp` avec son identifiant et découvrir les annonces de ses pairs. Il MUST ignorer toute adresse annoncée qui n'est pas privée ; une adresse de bouclage n'est retenue que dans les tests et le banc de simulation. Il MUST borner le nombre de pairs retenus.

#### Scenario: AC: adresses publiques ignorées
<!-- openspec-guard:test="local network (T4.2) > keeps only private addresses from discovery, loopback only when allowed" -->
- **WHEN** une annonce porte une adresse publique, une adresse de bouclage et une adresse privée
- **THEN** seule l'adresse privée est retenue

### Requirement: Session locale authentifiée
Une session locale SHALL commencer par un défi signé dans les deux sens avec la clé Ed25519 annoncée ; aucune enveloppe MUST NOT être traitée avant les deux preuves. En sortie, le Node MUST NOT ouvrir de session que vers un pair appairé ou l'inviteur d'un code en cours, et l'identifiant prouvé MUST être celui visé. En entrée, il MUST refuser une clé inconnue hors invitation en cours.

#### Scenario: AC: imposteur refusé
<!-- openspec-guard:test="local network (T4.2) > refuses a peer whose proof does not match the announced or expected key" -->
- **WHEN** un pair annonce l'identifiant d'un autre ou ne prouve pas sa clé
- **THEN** la session est fermée sans qu'aucune enveloppe ne passe

#### Scenario: AC: clé inconnue refusée hors invitation
<!-- openspec-guard:test="local network (T4.2) > refuses an unknown key when no invite is live" -->
- **WHEN** une clé ni appairée ni en cours d'appairage ouvre une session et qu'aucune invitation n'est en cours
- **THEN** la session est fermée avec `E_LAN_UNKNOWN` et rien n'est transmis au moteur

### Requirement: Robustesse de l'écoute locale
Une trame trop grande, hors schéma ou trop fréquente SHALL fermer la seule session concernée, jamais le Node. Le nombre de connexions et de sessions MUST être borné ; une adresse injoignable MUST se traduire par un échec d'envoi local, sans exception non rattrapée.

#### Scenario: AC: trames invalides sans arrêt du Node
<!-- openspec-guard:test="local network (T4.2) > survives malformed, oversized and early frames, and dead addresses" -->
- **WHEN** un client envoie une trame de 600 Kio, puis du texte hors JSON, et qu'un pair annoncé ne répond pas
- **THEN** ces sessions sont fermées, l'envoi rend `unreachable` et le Node accepte encore une session valide

### Requirement: Chemin local préféré
Une enveloppe vers un pair joignable par une session locale authentifiée SHALL passer par elle ; sinon le Node SHALL utiliser le relais configuré, et sinon la file d'envoi. Une enveloppe ne MUST compter comme remise localement qu'après un accusé signé par la clé du destinataire ; sans cet accusé, le Node SHALL passer au relais.

#### Scenario: AC: échange sans relais
<!-- openspec-guard:test="local network (T4.2) > completes a consented drop between two paired nodes with no relay at all" -->
- **WHEN** deux Nodes appairés se découvrent localement et qu'aucun relais n'est joignable
- **THEN** une demande, sa décision et son résultat circulent par la session locale

#### Scenario: AC: accusé signé exigé
<!-- openspec-guard:test="local network (T4.2) > counts an envelope as delivered only after the peer signed its acknowledgement" -->
- **WHEN** l'accusé de réception d'une enveloppe n'est pas signé par la clé du destinataire
- **THEN** l'envoi local rend `unreachable` et la session est fermée

### Requirement: Mode local refusé ou désactivé
Si le système refuse l'accès au réseau local ou si l'écoute est impossible, le Node SHALL journaliser `E_LAN_DENIED` et continuer par le relais. Avec `lan: false` dans sa configuration, il MUST n'écouter ni n'annoncer quoi que ce soit sur le réseau local.

#### Scenario: AC: mode local désactivé
<!-- openspec-guard:test="local network (T4.2) > neither listens nor announces when the local mode is off" -->
- **WHEN** le Node démarre avec `lan: false`
- **THEN** aucun port local n'est ouvert pour le réseau et aucune annonce n'est faite

#### Scenario: AC: écoute impossible
<!-- openspec-guard:test="local network (T4.2) > reports E_LAN_DENIED and keeps going when the local port cannot be opened" -->
- **WHEN** le port local est déjà pris au démarrage
- **THEN** le Node journalise `E_LAN_DENIED`, son état local est `denied` et le démarrage continue
