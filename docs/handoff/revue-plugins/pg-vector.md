# Revue du plugin pg-vector (2026-10-09)

Étape 3 du [plan](../api-challenge-plan.md). Source :
[fiche d'inventaire](../api-inventory/pg-vector-plugin.md).

## Constat

Le plugin ajoute `field.vector({ dimensions })` (validation, codec GraphQL)
mais n'est utilisable dans aucune application persistée : PostgreSQL refuse
de démarrer (aucun compilateur de champ), REST refuse d'exposer le champ
(aucun codec), aucune recherche par similarité n'existe. `create-app` le
propose pourtant.

## Décisions

1. **Retrait immédiat de `create-app` et de la liste officielle** tant qu'il
   ne fonctionne pas.
2. **Le terminer après la migration de Core** : cas réel d'un plugin qui
   apporte son champ, son opérateur de requête et son stockage sans que Core
   le connaisse ; argument fort pour les applications d'IA.
3. **API visée** :

   ```ts
   embedding: field.vector({
   	dimensions: 1536,
   	distance: 'cosine',
   	index: 'hnsw',
   })
   Doc.findMany({ orderBy: { embedding: { nearest: queryVector } }, take: 10 })
   Doc.findMany({
   	where: { embedding: { within: { vector: queryVector, distance: 0.3 } } },
   })
   ```

   Vocabulaire de requête habituel ; Access, ACL et Soft Delete s'appliquent
   aux résultats ; extension `vector` vérifiée au démarrage avec un message
   clair ; codecs REST et GraphQL fournis par le plugin.

4. **Neutre (tranché par l'audit : plugin `vector` neutre et une implémentation par adaptateur, voir adaptateurs.md)** — question initiale : neutre ou propre à PostgreSQL (plugin `vector` neutre implémenté par
   chaque adaptateur, ou plugin PostgreSQL) : tranché avec l'audit des
   adaptateurs de base.

Revue validée par l'utilisateur le 2026-10-09.
