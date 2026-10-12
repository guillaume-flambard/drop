# Ce que drop reprend de Tailscale, Glean et OpenZiti (12 octobre 2026)

Étude concurrentielle fournie par Guillaume le 12 octobre 2026, croisant billets de fondateurs, études de cas, avis G2 et discussions Reddit. Les chiffres et citations ci-dessous viennent de cette étude et de ses sources ; ils n'ont pas été revérifiés un à un. Ce document en garde ce qui change le travail de drop, et le confronte à ce que le code fait déjà sur `main`.

## La thèse retenue

Les produits d'infrastructure qui réussissent ne vendent pas leur sophistication : ils rendent invisible une opération autrefois pénible. Pour drop, la promesse n'est pas « relier deux agents par un protocole sûr » mais : « Demande à ton IA. Ton collègue autorise. Tu obtiens la réponse. » Le premier signe de succès de l'essai T4.6 ne sera pas que les testeurs trouvent drop impressionnant, mais qu'ils recommencent le lendemain et l'installent chez un collègue.

## Ce que chaque produit enseigne

| Produit | Leçon | Source principale |
|---|---|---|
| Tailscale | La qualité (connexions, Windows, installation) a accompagné la croissance, portée par le bouche-à-oreille ; gratuit pour l'individu, payant pour l'organisation | [Series B](https://tailscale.com/blog/series-b), [Free plan](https://tailscale.com/blog/free-plan) |
| Tailscale (critiques) | Invitation confuse quand le destinataire doit d'abord s'inscrire ; politiques d'accès techniques ; diagnostic frustrant quand deux appareils « connectés » ne se parlent pas | [Reddit, invitation](https://www.reddit.com/r/Tailscale/comments/1gylr9p/being_invited_to_a_tailnet_is_really_confusing/), [Reddit, partage](https://www.reddit.com/r/Tailscale/comments/1oh04o2/sharing_a_device_in_tailscale_is_one_of_the_most/) |
| Glean | La valeur perçue est la réponse pertinente sans ouvrir plusieurs outils ; les critiques portent sur les résultats périmés et les sources mal classées | [Databricks](https://www.glean.com/resources/customer-stories/databricks), [G2](https://www.g2.com/fr/products/glean-technologies-glean/reviews) |
| OpenZiti | La confiance porte sur la ressource précise (identité et politique par service) ; une architecture élégante peut rester difficile à adopter | [Reddit](https://www.reddit.com/r/selfhosted/comments/1odbe1p) |

## Confrontation avec drop au 12 octobre

| Exigence tirée de l'étude | Où en est drop | Écart |
|---|---|---|
| Une équipe se rejoint en un lien, sans configuration réseau | Lien unique (T4.23, D95), suites dans le panneau (T4.31), durcissement (T4.33) | La page `/join` répond 404 en production tant que lab-infra#147 n'est pas déployée ; aucune version téléchargeable pour un destinataire qui n'a jamais installé drop (T4.41) |
| Connexions fiables, reconnexion automatique | Vivacité du client relais (T3.1f, D100), demandes non confirmées (T4.39) | Les chemins directs (réseau local, iroh) disent encore « injoignable » sans preuve de non-réception (relevé en T4.39) |
| Une erreur dit si la cause est la connexion, une permission, le modèle ou un refus | requester-mcp rend le code et le message d'erreur du pair (`tools.ts`) ; carte de consentement à états nommés en cours (T4.35) | Pas de cause en langage clair côté demandeur : **T4.45** |
| Une réponse exploitable, avec provenance, fraîcheur, limites et qui l'a autorisée | requester-mcp dit déjà qui a fourni la réponse, par quelle capacité, si elle est écrite à la main, et la validité d'un fait publié | Ni la date de la réponse, ni la fraîcheur de la source, ni ce que la réponse ne couvre pas, ni l'heure de l'autorisation : **T4.44** |
| Permissions précises par capacité et par identité | Capacités à outils fixés, consentement par demande, pairs admis par identité | Le langage naturel des permissions dans le panneau reste à juger à l'essai (T4.16, T4.24) |
| Présenter des personnes et ce qu'elles savent, pas des machines | requester-mcp liste déjà les aides par personne et par sujet ; onglet « Équipe » du panneau | À observer à l'essai avant de construire plus |
| Adoption gratuite et diffusion entre collègues | Essai en binômes (T4.6, protocole T4.6b) | Modèle économique au lancement (T4.13) |

## Ce que drop ajoute aux trois

Le propriétaire ne contrôle pas seulement qui interroge son environnement, mais aussi ce qui en sort : chaque réponse passe par son accord, par le schéma de sortie de la capacité et par le scanner de secrets. C'est la différence à rendre visible dans la carte de réponse (T4.44).

## Ce que l'étude ne prouve pas

Une petite cohorte d'essai ne permettra pas de conclure à un marché. Les avis G2 et Reddit sont des échantillons, pas des mesures. L'étude n'a pas fait de rétro-ingénierie des applications : ses conclusions viennent des interfaces publiques et des retours clients.
