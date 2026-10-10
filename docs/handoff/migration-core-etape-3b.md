# Migration de Core, étape 3b : pagination par position et résultats en données simples (ADR-0309, ADR-0310)

Branche `migration/plain-results` (worktree `../ub-step3b`), basée sur
`main` local 4cd8a553 (étape 3a). Plan d'ensemble :
`docs/handoff/migration-core.md` sur la branche `api-challenge`.

## Périmètre

ADR acceptés, copiés dans `docs/adr/` et inscrits dans `docs/adr/README.md`
(ADR-0109, 0115, 0150, 0151, 0201 et 0227 passés en « superseded » ;
ADR-0022, 0118, 0155, 0192, 0228, 0238 et 0245 annotés) :

- ADR-0309 : `take` / `skip`, `findMany({ after })` par position avec
  départage par `id`, position validée puis transformée en filtre de
  l'appelant, `skip` et `after` exclusifs, encodeur partagé dans
  `@ultimabase/core/plugin`, REST `take` / `skip` / `after` et `nextCursor`,
  GraphQL Relay `first` / `after`, `cursorSecret` et
  `ULTIMABASE_CURSOR_SECRET` retirés, prédicat de position PostgreSQL sans
  `OFFSET`.
- ADR-0310 : résultats en objets simples gelés ; retrait des modèles
  constructibles, des méthodes d'instance, des poignées de relation et de la
  surface `model` des plugins ; `Pointer` sans `findOne` / `exists` ;
  `Model<T>`, `CreateInput<T>`, `UpdateInput<T>` ; enums `values` en tableau
  ou `defineEnum` ; `toJSON(value)` partagé avec REST.

Ordre : ADR-0309 d'abord (point de contrôle), puis ADR-0310.

## État

- [x] ADR copiés et inscrits
- [x] ADR-0309 Core (noms, `after`, ordre total, filtre de position)
- [x] ADR-0309 encodeur `@ultimabase/core/plugin`
- [x] ADR-0309 PostgreSQL, REST, GraphQL
- [x] ADR-0309 tests et documentation (point de contrôle)
- [ ] ADR-0310
- [ ] Porte finale

## Décisions (à confirmer par l'utilisateur)

ADR-0309 :

1. **AST** : `QueryAst.limit` → `take` ; nœud `{ kind: 'offset-pagination',
   offset }` → `{ kind: 'skip-pagination', skip }` (`QuerySkipPaginationNode`,
   `QuerySkipPaginationInput`) ; exports `normalizeQueryLimit` /
   `normalizeQueryOffsetPagination` → `normalizeQueryTake` /
   `normalizeQuerySkipPagination`. `QueryBuilder` : `.take()` / `.skip()`,
   pas de `.after()` (position réservée à `findMany`).
2. **Ordre total** : `id` ascendant ajouté à l'ordre de toute lecture racine
   `findMany` (normalisation Core, visible dans l'AST) ; `findOne` et les
   `include` gardent l'ordre demandé.
3. **Champs ordonnables** : `orderBy` refuse partout (y compris `findOne`,
   `include`, builder) les listes, pointeurs, relations, JSON, objets et
   champs de plugin (`TypeError` à la normalisation, comme les autres erreurs
   de forme).
4. **Erreurs de position** : `FrameworkError` `VALIDATION_ERROR`,
   `publicDetails: { parameter: 'after' }`, levée de façon synchrone à la
   normalisation (comme les autres erreurs d'entrée de `findMany`) ; message
   public « The after position is missing the ordered fields a, b. »,
   « … cannot be combined with skip. », « … is invalid. » (valeur invalide,
   chaîne mal formée, autre schéma ou ordre) ; `undefined` compte comme absent.
   La position accepte tout objet non tableau (résultats encore modèles avant
   ADR-0310) et lit ses propriétés propres.
5. **Prédicat** : OR de branches « égalités préfixes ET champ strictement
   après » ; champ nullable : `> v OR IS NULL` ; position `null` : branche
   vide (rien après un `null` hormis le départage `id`). Construit
   directement en nœuds AST (le `gt` public reste refusé sur uuid/enum/
   booléen/binaire) ; PostgreSQL déclare `greater-than` / `less-than` pour
   `binary`, `boolean`, `enum`, `uuid` (ADR-0301 s'applique au filtre de
   position).
6. **« Traité comme sélectionné »** : réalisé par les canaux existants
   d'Access — l'ordre passe par `read.orderBy`, la position par
   `read.where` ; un champ `read: false` est donc refusé à l'ordre. Les
   transports ajoutent les champs ordonnés et `id` à une sélection
   explicite (REST les retire de la réponse ; GraphQL ne les renvoie que
   s'ils sont demandés) : un champ caché statiquement y est refusé
   (`PERMISSION_DENIED` d'Access). Aucune nouvelle notion dans Core.
7. **Encodeur** (`@ultimabase/core/plugin`) : `encodeQueryCursor(schema,
   orderBy, row)` / `decodeQueryCursor(schema, orderBy, cursor)` et types
   `QueryCursorOrderBy`, `QueryPosition` ; charge utile JSON base64url
   `{ v: 1, s: className, o: [[champ, 'a'|'d'], …], p: [valeurs] }` ;
   `bigint` en chaîne décimale, binaire en base64url ; ≤ 4096 caractères,
   sinon `VALIDATION_ERROR` « is too long to encode ».
8. **Sous-chemin** : `packages/core/tsdown.config.ts` à deux entrées ; le code
   partagé part dans un bloc commun (`dist/foundation-*.{js,d.ts}`) ;
   `index.d.ts` ne fait plus que réexporter. Les tests qui lisaient le texte
   de `dist/index.d.ts` / `index.js` lisent désormais tous les fichiers
   émis (`core-archive-declarations`, `native-products-removal`) ; alias
   Vitest `@ultimabase/core/plugin` placé avant `@ultimabase/core` ;
   `reference.content.test.ts` admet `./plugin` pour Core seulement.
9. **REST** : `take` / `skip` / `after` (GET et POST) ; `{ results,
   nextCursor }` sans `skip`, `{ results }` avec `skip` ; lecture de
   `take + 1` lignes ; erreur de position → `VALIDATION_ERROR` 400
   (`details.parameter: 'after'`), les autres erreurs de normalisation
   restent `REST_READ_INVALID_INPUT`. `executeRestReadRequest` /
   `normalizeRestReadRequest` (publics) inchangés en signature : le
   `nextCursor` est calculé par le répartiteur HTTP. Option `maxLimit` gardée
   (nom inchangé, borne de `take`).
10. **GraphQL** : `cursorSecret`, `ULTIMABASE_CURSOR_SECRET`, la clé HMAC et
    `GraphqlInvalidCursorError` (export public) retirés ; curseur d'arête =
    position partagée (identique au `nextCursor` REST) ; `hasPreviousPage`
    = `after` fourni. **Connexions imbriquées (relations)** : argument
    `after` retiré du SDL (Core ne lit pas de position dans un `include`,
    hors périmètre d'ADR-0309) ; `first`, `orderBy`, `where` gardés ; leurs
    curseurs d'arête restent des positions du schéma cible.
11. **Défaut et maximum de `take`** : non unifiés à cette étape (REST
    100 / 1000, GraphQL 25 / 100). ADR-0309 renvoie le choix « à leur
    migration » et la décision 5 de `rest.md` ne fixe pas de valeurs ;
    à trancher par l'utilisateur (étape 6).
12. **create-app** : `ULTIMABASE_CURSOR_SECRET` retiré du `.env.example`
    généré.

## Reports et conflits

- Valeurs communes de `take` par défaut / maximum (décision 11).
- Pagination par position dans les connexions GraphQL imbriquées (hors
  périmètre d'ADR-0309) : le test public
  `relation-filter-public-vertical` ne parcourt plus une seconde page de
  `contributors` par `after` ; il vérifie que l'argument est refusé.

## Tentatives écartées

## Preuves

Point de contrôle ADR-0309 (avant commit) :

- `yarn typecheck` : exit 0 ; `yarn format:check` : propre ;
  `yarn constraints` : propre ; eslint des fichiers modifiés : 0 erreur.
- `yarn vitest run --project unit` : 467 fichiers, 2 691 tests (2 échecs
  corrigés ensuite : README racine `limit`, fixture Typegen) ;
  `--project types` : 116 fichiers, 233 tests, 0 erreur de type ;
  `--project website-content` : 17 / 66.
- `--project coverage-e2e --project coverage-postgres-e2e` : 93 fichiers,
  341 tests, 6 échecs corrigés (renommages oubliés, `nextCursor`,
  déclarations Typegen engagées, `after` imbriqué).
- `yarn build && yarn test:e2e:built` : 116 fichiers, 488 tests, 3 échecs
  corrigés (`nextCursor`, lecture des déclarations découpées).
- Nouveau `tests/e2e/keyset-pagination.postgres.e2e.test.ts` : 9 / 9.

## Prochaine action vérifiable

ADR-0310 : résultats en objets simples gelés, retrait des modèles et des
poignées de relation.
