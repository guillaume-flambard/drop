# Preuves T4.1

| Critère | Preuve |
|---|---|
| Banc isolé : refus d'un relais hors bouclage | Test « simulation campaign (T4.1) > AC refuses a relay outside loopback before starting anything » et test unitaire de `assertLoopbackRelay`. |
| Banc isolé : aucun processus orphelin | Test « simulation bench signals (T4.1) > AC stops every process it started when the bench receives SIGTERM mid-campaign » ; contrôle après la campagne de 50 nœuds : aucun processus restant. |
| Banc isolé : aucune notification, environnement filtré | `DROP_NOTIFY=off` imposé aux nœuds, test « notifications (T4.1) > AC stays silent when DROP_NOTIFY is off, even on macOS » ; seules PATH, TMPDIR, LANG, LC_ALL et TZ sont transmises. |
| Même graine, même plan | Test « simulation plan (T4.1) > AC same seed same plan, different seed different plan » ; la campagne de 50 nœuds rejouée avec la graine 1 reproduit les mêmes 8 délais dépassés chez le même propriétaire. |
| Politique de décision respectée | Test « AC decision policy is followed within 3 points » et allocation au plus fort reste testée sur des totaux impairs. |
| Statistiques du rapport | Test « simulation report (T4.1) > AC report statistics are exact ». |
| Campagne réelle de bout en bout | Test à 3 nœuds (2 livrées, 2 refusées, 2 reportées, 0 fuite, 0 orphelin) ; campagne de référence de 50 nœuds dans `proof/` (rapport, plan, événements compressés). |

## Campagne de référence (10 octobre 2026)

50 nœuds dont 10 propriétaires, 160 demandes en 180 s, graine 1 : 124 livrées, 14 refusées, 14 reportées, 8 délais dépassés. Latence des livrées : médiane 100 ms, 95e centile 187 ms. Mémoire résidente : nœud médian 71,9 Mo, nœud le plus lourd 92,4 Mo, relais 67,2 Mo (un premier passage avait mesuré 49 Mo de médiane : la mesure varie, les seuils de régression devront avoir une marge). Fuites : 0, contrôle fait sur chaque résultat livré et sur les fichiers des demandeurs.

Les 8 délais dépassés viennent tous du propriétaire 4 : il franchit la limite de 60 messages par minute du relais, puis ses envois refusés (`E_RATE`) et ses reconnexions se répètent jusqu'à la fin de la charge (135 refus). Défaut déjà dans le périmètre de T3.1d, preuve ajoutée à l'index ; non corrigé ici.

## Vérification

`pnpm -s lint`, `pnpm -s typecheck`, `pnpm -r test` (366 tests), `openspec validate --all --strict`, openspec-guard avec sélecteurs. Revue adverse et sécurité : 3 critiques (contrôle de fuite qui ne lisait pas les résultats, fragment « 4242 » sujet aux faux positifs, arrondi de la politique) et 9 informations, tous corrigés. `/cso` gstack en mode diff ciblé : statut partiel, aucune faille démontrée sur `DROP_NOTIFY` ni sur l'isolation du banc.
