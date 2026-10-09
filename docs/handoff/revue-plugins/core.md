# Revue de Core (2026-10-09)

Étape 3 du [plan](../api-challenge-plan.md). Source :
[fiche d'inventaire](../api-inventory/core.md).

## Déjà décidé

Forme D, `Register` et types nommés, cibles `() => X`, fabriques de plugins
(ADR-0297, décisions des formes) ; `where: { id }`, liaison à la Prisma,
sémantique `RETURNING`, `useMasterKey: boolean`, `start()` renvoie
l'application ; `can()`, `health()`, principal neutre, `PublicError`, index
partiels, contrat des adaptateurs, rejeu des transactions, règle développement
/ production (revues des plugins). Bug de typage des `include` corrigé le
2026-10-08.

## Décisions

1. **Plus de modèles à méthodes** : fin de `new Post({…}).create()`,
   `post.update()`, `post.delete()`, `post.fetch()`,
   `post.relation('tags').connect()` ; les résultats sont des données
   (`Model<"Todo">`) et tout passe par les méthodes du schéma
   (`Todo.createOne`, `Todo.updateOne({ where: { id }, data: { tags: { connect } } })`).
2. **`get` renommé `findOneOrThrow`** (à côté de `findOne` qui renvoie `null`).
3. **Opérations atomiques en objets** à la Prisma :
   `data: { views: { increment: 1 }, note: null }` ; plus d'import
   d'`increment`/`decrement`/`unset`.
4. **`ultimabase.transaction(fn)`** avec le contexte courant par défaut.
5. **Pagination par curseur dans Core** (`take`, `after`, curseur suivant
   dans le résultat), partagée par REST et GraphQL.
6. **Contexte** : les notions de contexte (`anonymous`, `withContext`,
   `RequestContext.anonymous`, `RequestContextValue`, `RequestCapability`)
   réservées aux auteurs de plugins (export séparé) ; côté application,
   `useMasterKey` et `transaction` suffisent. À affiner pendant la migration.
7. **Rapport de démarrage lisible** : une ligne de résumé par défaut, détail
   des privilèges en débogage ; les avertissements importants restent
   visibles.
8. **Cycle de vie documenté** : `start()` et `await using` (ou `dispose()`)
   dans les guides ; `compile`, `initialize`, `stop` pour les cas avancés.
9. **Constructeurs publics `WhereBuilder` / `QueryBuilder` retirés** ; le
   builder reste là où on le reçoit (règles, filtres) ; à vérifier pendant la
   migration.

Revue validée par l'utilisateur le 2026-10-09.
