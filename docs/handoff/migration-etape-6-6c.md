# Migration, sous-étape 6.6c : GraphQL, explorateur unique et preset `api-server` (ADR-0325)

Branche `migration/graphql` (worktree `../ub-step6-6c`), basée sur `main`
local 0e390039 (fusion de 6.6b).

## Portée

ADR-0325, décisions 1 à 9 et conséquences :

1. `.with({ graphql: { … } })` par les noms de méthodes (commandes de plugin
   comprises), hors des gabarits ; `publicWrites` et opérations publiques
   déclarées par leur propriétaire (F1) comme ADR-0324 ; retrait de la liaison
   GraphQL TEMPORAIRE de plugin-kit, de l'acquittement de Core
   (`acknowledgeUnverifiedProtection`, avertissement) et de
   `passwordAuthOperationList`.
2. Champ racine `health` (`OK`/`DEGRADED`), démarrage sans schéma exposé avec
   un avertissement.
3. Indices sur les fonctionnalités désactivées.
4. `totalCount` (seulement s'il est demandé et si `count` est permis).
5. Filtres limités aux opérateurs déclarés par l'adaptateur (ADR-0301,
   décision 5).
6. `resolveMany` des champs virtuels, résolution parallèle par parent des
   cibles incluses, tests du nombre de requêtes, documentation du N+1.
7. `graphqlPlugin({ sdl })`.
8. `graphqlExplorerPlugin({ ui })` remplace `@ultimabase/graphiql-plugin` et
   `@ultimabase/apollo-sandbox-plugin`.
9. Paquet `@ultimabase/api-server`, `apiServer({ rest, graphql, http, server })`.

Critère de fin : porte complète sur le dernier commit de code
(`yarn validate:full`, `yarn test:e2e:built`, `yarn website:test`), audit DX
expliqué, banc forme D TS6/TS7.

## État

En cours. Fait : décisions 1 à 4 et 7 dans le plugin GraphQL (règles,
indices, `health`, `totalCount`, `sdl`), Core sans acquittement, plugin-kit
sans liaison GraphQL, tests unitaires et de types migrés.

## Décisions prises (non fixées par l'ADR, à confirmer)

1. Clés de la règle : celles de REST (`findMany`, `findOne`, `count`,
   `exists`, `createOne`…`upsertMany`) plus `typeName` ; `findOne` couvre
   `get<Type>` et `findOne<Type>` ; les noms des champs racine ne changent pas
   (`createTodo`, `createManyTodo`). Les commandes : exposées si la règle les
   nomme, ou si la règle ou le `default` vaut `true` (comme REST).
2. Opération publique sans liaison GraphQL de son propriétaire : mutation au
   nom public, `input: JSON`, résultat `JSON`, entrée validée par le contrat de
   l'opération. Commande sans liaison : entrée `{ id }` seulement (comme la
   liaison TEMPORAIRE retirée).
3. `publicWrites` : écritures = mutations générées et commandes ; les
   opérations ne comptent pas (comme REST). Message d'erreur sur le modèle de
   REST.
4. `health` : enum `HealthStatus { OK DEGRADED }`, nom réservé ; avertissement
   « GraphQL exposes no schema or operation, only its health field ».
5. Indices : message de GraphQL suivi de `hint: enable graphql: { count: true }
on Todo` ; exposés par `GraphqlApplication.validationRules` (Yoga valide avec
   les mêmes règles).
6. `totalCount` : champ des connexions racine seulement quand `count` est
   permis ; sur une connexion de relation il échoue en `VALIDATION_ERROR`
   (Core n'a pas de compte de relation dans `include` : reporté).
7. `sdl` : fichier écrit au démarrage des transports, chemin relatif au
   répertoire courant, déclaration `environment:filesystem`.

## Approches rejetées

## Preuves

## Prochaine action vérifiable

Opérateurs déclarés (décision 5).
