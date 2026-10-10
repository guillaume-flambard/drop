## ADDED Requirements

### Requirement: Destinations A2A privées
En profil privé, la carte, les interfaces annoncées et le polling A2A MUST respecter la politique réseau et rester sur l’origine configurée. Les identifiants MUST NOT être transmis à une autre origine.

#### Scenario: AC: interface secondaire refusée
<!-- openspec-guard:test="private adapters > blocks A2A secondary interfaces even when their origin is in the general allowlist" -->
- **WHEN** une carte interne annonce une interface sur une autre origine
- **THEN** la question et les identifiants ne sont pas envoyés à cette interface.
