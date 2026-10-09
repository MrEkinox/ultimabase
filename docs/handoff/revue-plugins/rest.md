# Revue du plugin REST (2026-10-09)

Étape 3 du [plan](../api-challenge-plan.md). Source :
[fiche d'inventaire](../api-inventory/rest-plugin.md), README du paquet.
Les décisions qui changent un contrat public donneront un ADR à la migration.

## Concept

Conservé : routes générées par schéma à la Parse (`/api/classes/{Schema}`, voir décision 13),
opérations des plugins et commandes de schéma exposées, exécution par Core
(jamais de SQL), exposition réglable par schéma. Déjà réglé : `/count`
désactivé → 404 (2026-10-08) ; refus de démarrer quand des écritures
publiques n'ont ni politique ni `publicWrites: true` (ADR-0294),
`allowWithoutRule` d'Access comptant comme politique explicite.

## Décisions

1. **`acknowledgeUnverifiedProtection` supprimé** : remplacé par la règle
   d'ADR-0294.
2. **Vocabulaire unique** : les clés de l'option `rest` sont les noms des
   méthodes des schémas (`count`, `upsertOne`, `deleteOne`…), les mêmes que
   pour `graphql` et les règles Access.
3. **Erreurs détaillées** :
   `details: { parameter, path, reason }` (le schéma exposé est public) ;
   méthode désactivée → 405 au lieu de 404.
4. **Limite de corps unique** : celle du plugin HTTP par défaut, remplaçable
   par transport (fin du doublon REST / Yoga).
5. **Pagination commune** : mêmes valeurs par défaut en REST et GraphQL
   (aujourd'hui 1 000/100 contre 100/25).
6. **Exposition des opérations décidée par le plugin propriétaire (F1)** :
   un plugin déclare quelles opérations sont faites pour être publiques
   (ex. `login`, `signUp`) ; elles sont exposées par chaque transport
   installé ; l'application peut masquer
   (`restPlugin({ hide: [authOperations.refresh] })`) ; une opération non
   déclarée publique n'est jamais exposée. Fin de la liste répétée entre REST
   et GraphQL.
7. **Cible pour les opérations personnalisées (moins de 30 lignes)** :
   `defineOperation({ name, input, output, handler })` avec validateurs
   standard ; REST et GraphQL déduisent leurs formats (types GraphQL simples
   déduits, JSON en dernier recours). Conçu avec la façade `definePlugin`.
8. **Gardé** : routes `/classes/{Schema}`, réponses `{ results }` /
   `{ result }`, codecs de champ, `basePath`, `maxLimit`, `instanceId` (deux
   API distinctes, publique et interne).
9. **OpenAPI** : `restPlugin({ openapi: true })` publie
   `/api/openapi.json` (routes exposées, champs, types, contraintes de
   validation quand le validateur sait les décrire) ; aucune règle d'accès
   révélée.
10. **Pagination par curseur** (`?after=…`, même mécanisme que GraphQL), en
    plus de l'`offset`.
11. **Plus tard** : client typé sans génération par `import type` (à la Hono
    RPC ou tRPC : `createClient<typeof ultimabase>(url)`) ; lot multi-schéma
    à la `/batch` de Parse.
12. **Documenté** : `where` en JSON reste la seule forme de filtre (pas de
    filtres simples dans l'URL, conflits avec les paramètres réservés).

13. **Plus de version dans l'URL** (décidé après la revue) : préfixe par
    défaut `/api` (`/api/classes/Todo`, `/api/auth/login`) au lieu de
    `/api/v1`, car le `v1` est la version du protocole REST d'UltimaBase, lue
    à tort comme celle de l'API de l'application ; version du protocole dans
    l'en-tête `X-UltimaBase-Rest-Version` ; `basePath` entièrement libre
    (`/api/v1` possible pour versionner sa propre API) ; un éventuel
    changement de format se choisira par option (`protocol: 2`) sans changer
    les URL. La route de santé reste `/health` à la racine.

Revue validée par l'utilisateur le 2026-10-09.
