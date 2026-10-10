# Modèles gratuits et modèles internes

Décision D37, 9 octobre 2026. Le socle doit fonctionner sans abonnement modèle imposé. Un modèle local évite un coût d'API, mais demande du matériel, du stockage et de l'électricité.

## Ordre proposé

1. **Aucun modèle pour une capacité déterministe.** Le routage `ask_team` et le résumé d'erreurs déterministe n'en ont pas besoin.
2. **Réutiliser le modèle ou l'agent du client.** Endpoint compatible OpenAI choisi par le propriétaire, ou agent A2A interne approuvé. Les agents demandeurs conservent leur propre modèle.
3. **Option locale si nécessaire.** Ollama et un modèle choisi, téléchargés après consentement. Le raccordement des agents ne déclenche jamais ce téléchargement.

## Candidats à qualifier

| Candidat Ollama     | Usage envisagé                                           | Poids quantifiés à télécharger |
| ------------------- | -------------------------------------------------------- | ------------------------------ |
| `qwen3.5:4b-q4_K_M` | Premier essai sur Mac, réponses courtes et outils bornés | Environ 3,3 Go                 |
| `qwen3.5:9b-q4_K_M` | Comparaison de qualité sur machine plus dotée            | Environ 6,6 Go                 |

Tailles du [catalogue officiel Ollama](https://ollama.com/library/qwen3.5/tags), susceptibles de changer. Ce ne sont **pas des besoins totaux en RAM** : contexte, cache, runtime et autres apps s'ajoutent. Les fiches [Qwen3.5 4B](https://huggingface.co/Qwen/Qwen3.5-4B) et [9B](https://huggingface.co/Qwen/Qwen3.5-9B) déclarent Apache-2.0. Licences des poids, du runtime et de drop à inventorier séparément avant redistribution.

Ces modèles n'ont pas été mesurés dans drop. Le support d'outils annoncé ne prouve pas leur fiabilité dans nos capacités. Les anciens essais Qwen3 de D19 ne sont pas des benchmarks Qwen3.5. Aucun minimum RAM ni délai garanti avant T3.2.

## Politique cible

Le propriétaire fixe endpoint, modèle, budgets et outils. Le financement ne remplace pas cette destination. En profil privé, seules les destinations autorisées reçoivent du contexte ; une panne reste visible, sans fallback distant.

Un modèle interne peut vivre sur une autre machine du réseau. Une app locale utilisant un cloud n'est pas un traitement entièrement local. Un agent A2A interne peut aussi utiliser un cloud : ses destinations doivent être vérifiées.

Avant téléchargement : version ou digest, licence, volume, emplacement, mémoire disponible et annulation. Après : vérification de disponibilité et suppression possible des poids. Un environnement isolé importe les poids via son canal administré. Ni modèle ni clé inclus dans l'app.

## Qualification T3.2

Consigner puce, mémoire, versions, digest, quantification et contexte du Mac de référence. Comparer 4B, 9B et l'endpoint interne disponible sur le même corpus : réponse sourcée, outil valide, source absente, contradiction, injection, expiration, sortie invalide et secret. Utiliser des fixtures publiques sans donnée personnelle.

Mesurer délais médian et p95, mémoire maximale, réussite d'outil, respect du schéma et erreurs factuelles relues. Les contrôles d'autorisation et de sortie doivent tenir même si le modèle échoue. Si aucun candidat ne convient, garder une configuration explicite sans recommandation par défaut.

Voir [AC-MODEL](ACCEPTANCE.md) et la [recherche sourcée](research/2026-10-09-desktop-models.md). Depuis T3.1, l’endpoint proposé est Ollama local, mais le nom de modèle reste vide : le propriétaire doit le choisir explicitement. Aucun poids n’a encore été qualifié par drop.
