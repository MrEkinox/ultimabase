# Inventaire de l'API développeur : Core (phase 1)

Branche `api-challenge`, 2026-10-08. Sondes et mesures dans
`node_modules/.cache/inventory-core/` (ignoré par Git) : `slice/` (tranche
todo-backend), `slice-err/`, `optcheck/`, `typos/`, `todo-check/`, `ex/`
(copies des exemples sans fichier généré), `probe.mjs`, `results.jsonl`.
Commande de vérification des tranches :
`node_modules/.bin/tsc -p <dossier>/tsconfig.<gen|src>.json` (strict,
`nodenext`, `exactOptionalPropertyTypes`, `skipLibCheck`, TypeScript 6.0.3).

## 1. Surface publique côté développeur d'application

### Application et plugins

- Fabrique configurée immuable : `UltimaBase.use(a(), b())` ou chaînée
  `.use(a()).use(b())` (ADR-0279, ADR-0282). Exemple :
  `examples/todo-backend/src/create-application.ts:48` —
  `UltimaBase.use(...createTodoPlugins(options))`. Un tableau ouvert perd
  l'inférence exacte : il faut `as const` (même fichier, ligne 31).
- Instance : `new Application({ schemas, masterAuthority?, validation?,
pluginPrivileges? })` (`packages/core/src/runtime/application/ultima-base-contracts.ts:25`).
  L'option `plugins` est refusée.
- Master : `new MasterAuthority({ keys: [{ id, value }], onUse })` passé à
  l'instance (`examples/minimal/src/create-application.ts:86`) ; usage par
  commande : `Todo.updateOne(input, { useMasterKey: true })`
  (`examples/todo-backend/src/todos.ts:44`).
- Cycle de vie : `compile()`, `initialize()`, `start()`, `stop()`,
  `dispose()`, `await using` (`packages/core/docs/runtime.md:23`). Une seule
  application initialisée par realm ; les méthodes statiques des schémas
  résolvent cette application active.
- Contexte de requête : `ultimabase.anonymous({ requestId, source })`,
  `ultimabase.withContext(ctx)`, `RequestContext.anonymous(...)`,
  `RequestContextValue`, `RequestCapability` ; option `{ context }` en dernier
  argument de toute commande (`packages/core/docs/runtime.md:539`).
- Plugins installés : `ultimabase.plugin(definition | id)` ; opérations :
  `ultimabase.operation(token | name)` ; `ultimabase.schema(...)`.

### Déclaration de schéma

- `App.Schema.define({ className, fields: (field) => ({...}), indexes?,
...optionsDePlugins })` (`packages/core/src/schema/schema/configured-schema-namespace.ts:353`).
  `UltimaBase.Schema.define` pour un schéma sans plugin. Spécialisations de
  paquet : `RoleSchema.define(App.Schema, {...})`,
  `PasswordUserSchema.define(App.Schema, {...})` (ADR-0284).
- Champs (`field.*`) : `string`, `int`, `bigint`, `float`, `decimal`
  (`precision`, `scale`), `boolean`, `binary`, `date`, `time`/`dateTime`
  (`timezone`, `autoNow`), `uuid`, `json`, `enum` (`values` tableau, enum TS
  ou objet ; `typeName`), `object` (`fields`, `typeName` ; builder imbriqué
  sans `pointer`/`relation`/`indexed`/`autoIncrement`), `virtual`.
  Options communes : `required`, `default` (valeur ou fonction), `list`,
  `immutable`, `indexed: true | 'unique'`, `description`, `autoIncrement`
  (int/bigint). Référence : `examples/todo-backend/src/schema.ts:71-230`.
- Relations à cible en chaîne : `field.pointer({ target: 'TodoUser',
onDelete: 'setNull' | 'cascade' | 'restrict', indexed })`,
  `field.relation({ target: 'Todo', mappedBy: 'assignee', where })` (`where`
  objet ou `({ context, where }) => ...`) ; voir
  `packages/core/docs/schema.md:150-300`.
- Champ virtuel : `field.virtual({ output: (o) => o.string({ nullable:
false }), select: { title: true }, resolve: ({ item, context }) => ... })`
  (`examples/minimal/src/schema.ts:226`).
- Index composites : `indexes: [{ fields: ['completed', 'dueAt'], unique? }]`.
- Options de plugins sur les champs : `hooks.resolveInput`, `access`,
  `validation` (Standard Schema), `postgres.renamedFrom` ; sur le schéma :
  `access`, `hooks`, `acl`, `softDelete`, `rest`, `graphql`, `postgres`.

### Requêtes

- `findMany`, `findOne`, `get` (lève `NOT_FOUND`), `count`, `exists`
  (`packages/core/src/schema/schema/schema-api.ts:86-180`).
- `where` objet (`{ completed: { eq: false } }`, `AND`/`OR`/`NOT`, `is`/`isNot`
  pour les pointeurs, `some`/`every`/`none`/`count`/`isEmpty` pour les
  relations, `between`, `at` pour les chemins JSON) ou `WhereBuilder`
  (`new WhereBuilder(Post).eq('published', false)`) et `QueryBuilder` +
  `QueryScope` (`packages/core/docs/query.md:171`).
- `select` booléen plat (mode inclusion/exclusion, `id` implicite),
  `include` (pointeur : `select`/`include` ; relation : plus `where`,
  `orderBy`, `limit`, `offset`), `orderBy` objet ordonné,
  pagination `limit`/`offset` uniquement (pas de curseur dans Core).
- Poignée de relation : `model.relation('posts').findMany(...)`,
  `.connect/.disconnect/.set/.clear`.

### Mutations et transactions

- `createOne/createMany`, `updateOne/updateMany`, `upsertOne/upsertMany`,
  `deleteOne/deleteMany` ; `updateOne`/`deleteOne` acceptent `id` ou `where`
  unique ; lots = items uniques ordonnés dans une transaction
  (`packages/core/docs/query.md:213-460`).
- Écritures imbriquées : `assignee: { connect: id } | { create: {...} }`,
  plus `update`/`disconnect` en mise à jour (`NestedPointerCreateInput`,
  `packages/core/src/schema/nested-writes/`). `increment`, `decrement`,
  `unset` importés de `@ultimabase/core`.
- Modèles immuables : `new Post({...}).create()`, `.upsert()`,
  `model.update()`, `.delete()`, `.fetch()`, `.exists()`, `Post.pointer(id)`.
- Transactions : automatiques pour toute mutation ; explicites via
  `ultimabase.anonymous({ requestId, source }).transaction(async () => ...)`
  (`apps/website/content/docs/1.0.0/core/writing-data/transactions.mdx:36`).
- Erreurs : `FrameworkError(code, message, { publicMessage, publicDetails,
internalDetails, cause })`, codes stables (`NOT_FOUND`,
  `TRANSACTION_ERROR`, `OPERATION_CANCELLED`…) (`packages/core/README.md:1648`).

## 2. Dépendances à Typegen

Mécanisme : le fichier généré augmente `@ultimabase/core`
(`UltimaBaseGeneratedSchemas`, `UltimaBaseGeneratedSchemaOptions`,
`UltimaBaseGeneratedFieldOptions`…, déclarées vides dans
`packages/core/src/schema/type-info.ts:26-80`). Tout passe par une recherche
par nom : `SchemaTypeInfoByNameOrBase<TClassName>` renvoie l'entrée générée ou
`BaseSchemaTypeInfo` (items `Record<string, unknown>`). 13 fichiers de
`packages/core/src` lisent ces interfaces.

| Élément                                                                        | Exact sans fichier généré ?                                             | Cause, code                                                                                                                                     |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Champs scalaires, enum, objet, index, `select`/`where` locaux d'un schéma seul | oui                                                                     | `SourceSchemaTypeInfo` (`schema/schema/source-type-info.ts`)                                                                                    |
| Cible `target: 'X'`, `mappedBy`, `where` de relation                           | non : `target` accepte toute chaîne, `mappedBy` et `where` non vérifiés | `SchemaDeclarationTargetName = string` sans registre (`type-info.ts:253`) ; graphe de noms, ADR-0279                                            |
| `include`, projection de la cible, poignée `relation()`, écritures imbriquées  | non : cible = `Record<string, unknown>`                                 | `SchemaReference<'TodoUser'>` → base (`schema/schema/definition.ts:153`)                                                                        |
| `access`/`hooks` de schéma                                                     | non : **option inexistante**, la déclaration entière échoue             | descripteurs uniquement générés (ADR-0280) ; contrôle `Exclude<keyof TDeclaredOptions, …> extends never` (`configured-schema-namespace.ts:331`) |
| `acl` de schéma                                                                | partiel : `data` des callbacks `unknown`                                | ADR-0283                                                                                                                                        |
| `where` complet (opérateurs de champs de plugin)                               | partiel                                                                 | ADR-0281 ; `schema/schema/source-filters.ts`                                                                                                    |
| Champ virtuel : `item` de `resolve`                                            | non dès qu'il dépend d'un objet ou d'un autre schéma                    | `SchemaTypeInfoFor<TSchema>['item']` (`schema/schema/virtual-field.ts:48`)                                                                      |
| Résultats de `PasswordUser`                                                    | non                                                                     | ADR-0284                                                                                                                                        |
| Options d'un plugin absent de la fabrique de schémas (`postgres`)              | seulement via le fichier généré                                         | `UltimaBaseGeneratedFieldOptions`                                                                                                               |
| Mutations de plugin (`softDelete`, `restore`, `purge`)                         | non si le schéma échoue ; oui sinon                                     | `UltimaBaseGeneratedSchemaClassSurface`                                                                                                         |
| Opérations nommées dynamiquement, poignées avancées                            | non                                                                     | `application/application-handles.ts:120`                                                                                                        |

Point clé : avec le fichier généré, l'entrée générée **remplace**
entièrement le type source du schéma (`SchemaReferenceTypeInfo`,
`definition.ts:153`). Il y a donc deux sources de vérité, et la source ne
sert qu'avant la première génération.

## 3. Frictions mesurées

### Tranche réécrite

`slice/src/` : `plugins.ts` (6 lignes), `user.ts` (12), `todo.ts` (31),
`application.ts` (11) ; `usage.ts` contient les vérifications de types. Le
fichier généré par `slice/generate.mjs` fait 369 lignes (11 393 octets) pour
deux schémas, contre 60 lignes de source.

| Vérification                                                                                                                                                               | Avec génération                                     | Sans génération                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Todo.Schema.define` avec `access` + `hooks`                                                                                                                               | OK                                                  | TS2345 « … is not assignable to parameter of type 'never' » sur l'objet entier (ligne 3), puis TS7031 `where`, `item`, `originalItem` en `any` implicite |
| `access: { read: true }` seul, `hooks` seul (`optcheck/a.ts`)                                                                                                              | —                                                   | même TS2345 : l'option n'existe pas                                                                                                                      |
| Faute dans `where.eq('archivd', …)` / `item.nope`                                                                                                                          | TS2345 / TS2339 sur la ligne fautive, message clair | masquée par l'erreur `never`                                                                                                                             |
| `include` pointeur : `assignee.displayName`                                                                                                                                | `string`                                            | TS2339 (`{}`)                                                                                                                                            |
| `@ts-expect-error` : champ inconnu dans `where`, dans `include.select`, dans `some` de relation inverse ; mauvaise valeur, mauvais pointeur, création imbriquée incomplète | 6/6 effectifs                                       | 6/6 inutilisés (TS2578)                                                                                                                                  |
| Typo `target: 'Todoo'`, `mappedBy: 'owner'`, `where` de relation (`typos/`)                                                                                                | 3/3 détectées                                       | 0/3                                                                                                                                                      |
| `acl.resolveInput` lisant `data.title`                                                                                                                                     | —                                                   | `unknown` (TS2322)                                                                                                                                       |

Exemples complets sans fichier généré (copies dans `ex/`) : todo-backend
8 erreurs (dont `postgres: { renamedFrom }` refusé : `postgresPlugin` n'est pas
dans la fabrique de schémas, l'option n'existe que par augmentation générée),
minimal 24 erreurs (`softDelete`/`restore`/`purge` absents, `subtitle` de
champ virtuel sur `{}`, 4 schémas en `never`).

### Défaut de typage trouvé (indépendant de Typegen)

Avec n'importe quel `include` en objet, tous les champs racine non inclus
deviennent `never`. `listPendingTodos` de `examples/todo-backend/src/todos.ts`
renvoie `title: never` et `id: never` (`todo-check/probe.ts`) ; même chose en
mode source (`TodoUser.findMany({ include: { assignedTodos: {...} },
select: { displayName: true } })` → `displayName: never`). Cause probable :
`MaterializeIncludedPointer<TValue, TInclusion>` est distributif sur
`TInclusion` ; pour un champ non inclus `IncludedPointerForField` vaut
`never`, donc le résultat est `never` au lieu de `TValue`
(`packages/core/src/query/query/result.ts:62-72` ; correctif probable :
`[TInclusion] extends [never] ? TValue : …`). Aucun test ne lit un champ
racine d'une requête avec `include`. `include: { assignee: true }` est
accepté mais laisse le type en `GeneratedPointerHandle` (à vérifier côté
Runtime).

### Hovers (`slice/inspect.mjs`)

- `Todo.findMany` avec `include` + `select` : 1 188 caractères (généré),
  dont les méthodes `get`, `toJSON`, `fetch`, `relation` de chaque modèle.
- `TodoUser.findOne` : 902 (généré) / 897 (source, avec
  `Simplify<Omit<…>>` et types de champs internes visibles).
- `Todo.createOne` : 583 (généré). `typeof Todo` : 139 (généré,
  `SchemaClass<Schemas.Todo>`) / 153 (source, `BaseSchemaTypeInfo<"Todo">`).
- Constante de schéma sans génération (`optcheck/b.ts`) :
  565 caractères de `ConfiguredSchemaResult<{ fieldBuilders…; fieldOptions… }>`,
  illisible. Sonde de performance : 809 (généré) / 884 (source).

Aucun n'atteint la cible de 300 caractères ; tous sont sous 2 000.

### Concepts, doublons et noms

- Concepts pour la tranche : fabrique, plugins, `Schema.define`,
  `className`, callback `fields`, 5 constructeurs de champs, `target` en
  chaîne, `mappedBy`, `typeName`, `access.read.where` (builder),
  `hooks.beforeOperation.update`, instance + `schemas`, plugin de base de
  données, `typegenPlugin` + `outputPath` + inclusion du `.d.ts` dans
  `tsconfig`, `start()` pour générer. Les 4 derniers n'existent que pour
  les types.
- `className: 'TodoUser'` répète le nom de l'export (3 fois dans
  todo-backend, 5 dans minimal) ; les cibles en chaîne répètent ce nom sans
  vérification avant génération.
- Liste de plugins écrite deux fois avec des options divergentes :
  `TodoSchemaApplication` (`accessPlugin()`, `examples/todo-backend/src/schema.ts:13`)
  et `createTodoPlugins` (`accessPlugin({ default: true })`,
  `create-application.ts:36`). La séparation existe parce que
  `postgresPlugin({ url })` exige l'URL au moment de déclarer les schémas.
- Enum `TodoPriority` déclaré deux fois avec les mêmes `values`
  (`schema.ts:153` et `:202`) pour partager un `typeName`.
- `operations: [...]` identique dans `restPlugin` et `graphqlPlugin`, avec
  `acknowledgeUnverifiedProtection: true` répété
  (`examples/minimal/src/schema.ts:31-55`).
- Les exemples importent des types depuis le fichier généré
  (`TodoNestedCreateInput`, `TodoUserCreateInput` dans `todos.ts:2`,
  `admin.ts:2` ; `import type {}` dans `minimal/src/schema.ts:17`).
- Deux formes pour un pointeur : `Post.pointer(id)` dans les brouillons et
  l'ACL, `{ connect: id }` dans `updateOne` (TS2322 en passant un `Pointer`,
  avec un message de plusieurs centaines de caractères).
- Une transaction explicite exige `requestId` et `source` ; il n'y a pas de
  `ultimabase.transaction(fn)`.
- `typegenPlugin` génère au `start()` : le premier typecheck d'un nouveau
  schéma avec `access`/`hooks` échoue tant que l'application n'a pas démarré
  (avec une base de données, sauf à utiliser `loadTypegenApplication`).
- La construction affiche le rapport de privilèges sur la console
  (`slice/generate.mjs`).

## 4. Mesures de performance TypeScript de départ

Sonde réelle : `packages/typegen/tests/performance/fixtures/current-typegen-authoring-probe.mjs`
(12 champs scalaires, `children`, `details`, `embedding`, `related` par
schéma ; `User` = `PasswordUserSchema`, `Role` = `RoleSchema` ; schéma avec
`access`, `hooks`, `softDelete` ; une requête `findMany` par schéma).
Copie adaptée `node_modules/.cache/inventory-core/probe.mjs` (seuls les
imports deviennent absolus, plus un mode `source` qui n'ajoute pas le fichier
généré). Commande, exécutée séquentiellement par `run-all.sh` :

```sh
cd node_modules/.cache/inventory-core
node --expose-gc --max-old-space-size=12288 probe.mjs <10|50|200> generated
```

Mode `generated` (référence), deux exécutions par taille, charge machine
(load average 1 min) entre 2,7 et 5,3 car d'autres agents tournaient :

| Schémas | Typecheck à froid | Édition → diagnostic | Tas max           | Déclaration | Génération   |
| ------- | ----------------- | -------------------- | ----------------- | ----------- | ------------ |
| 10      | 3,72 / 3,67 s     | 2,01 / 2,10 s        | 834 / 828 Mio     | 123 Ko      | 53 / 46 ms   |
| 50      | 8,35 / 8,40 s     | 6,90 / 7,00 s        | 1 522 / 1 523 Mio | 591 Ko      | 81 / 80 ms   |
| 200     | 46,0 / 44,1 s     | 52,3 / 51,8 s        | 5 588 / 5 665 Mio | 2,35 Mo     | 201 / 184 ms |

Écart entre exécutions inférieur à 5 %. À 10 et 50 schémas, les valeurs sont
à 3 % de celles du plan (3,57/2,01 s ; 8,08/6,74 s/1,53 Gio). La croissance
est superlinéaire : de 50 à 200 schémas (×4), le typecheck à froid est
multiplié par 5,4 et l'édition → diagnostic par 7,5 ; RSS 6,3 Go à 200
(`time-200-generated-1.txt`). Complétion, hover et diagnostic à chaud
restent sous 1,3 ms ; hover de la sonde : 809 caractères.

Le mode `source` (sans fichier généré) n'est **pas** une référence valide :
27, 147 et 597 diagnostics, car les schémas avec `access`/`hooks` tombent en
`never`. À titre indicatif : 2,50/1,35 s/508 Mio (10), 3,79/2,51 s/966 Mio
(50), 8,27/7,05 s/1 805 Mio (200). Ces chiffres sont une borne basse du coût
de l'inférence source, sans le graphe entre schémas.

## 5. Pistes et questions ouvertes pour le laboratoire de typage

1. **Le coût vient du graphe généré, pas de la source.** À 200 schémas, le
   mode source est environ 5 fois moins cher. Le laboratoire doit mesurer
   chaque variante en plus du budget « +10 % » : le budget actuel à 200
   (45 s / 52 s / 5,5 Gio) est sans doute inacceptable en soi.
2. **Problème 1 (cibles)** : la cible en chaîne n'est résolue qu'à travers
   `UltimaBaseGeneratedSchemas`. Pistes : getters colocalisés
   (`target: () => User`, déjà la forme bas niveau de `pointerField`,
   `fields/builtins/pointer.ts:60`) avec annotation différée ; ou chaînes
   résolues au niveau de l'application à partir du tuple `schemas` (type
   `App` paramétré par la liste). La seconde piste supprime la répétition
   d'importation mais place les erreurs sur `new App`. Elle impose que les
   consommateurs (`Todo.findMany`) obtiennent leurs types via l'application
   (`app.Todo.findMany`) ou via une augmentation écrite par le développeur.
   À mesurer : le message quand `mappedBy` ou `target` est faux.
3. **Problème 2 (options sur le schéma complet)** : aujourd'hui l'échec est
   total (`never`), pas une dégradation. `define(...).with((schema) => ({
access, hooks, acl }))` exploite le fait que la source infère déjà
   exactement les champs locaux. Restent à couvrir les champs ajoutés par
   plugin (`isDeleted`, `acl`), déjà calculés par
   `ResolvePluginSchemaProjection` (`configured-schema-namespace.ts:84`), et
   les mutations de plugin comme clés de `hooks`/`access`.
4. **Deux sources de vérité** : supprimer le remplacement du type source par
   l'entrée générée (`definition.ts:153`) quelle que soit la variante retenue.
5. **Options de plugins absents de la fabrique de schémas** (`postgres`) :
   les placer dans un `defineConfig` qui sépare la fabrique de types (sans
   URL) des valeurs d'environnement. Cela supprime aussi la double liste de
   plugins et colle au fichier `ultimabase.config.ts` sans cycle.
6. **Corriger le défaut `include` → `never`** avant de mesurer les variantes,
   sinon les tests de types du laboratoire hériteront du faux résultat.
7. **Hovers** : les modèles exposent `get`, `toJSON`, `fetch`, `update`,
   `relation`… dans chaque hover de résultat (≈ 500 caractères sur 809).
   Une interface nommée pour les méthodes de modèle rapprocherait de la cible
   de 300.
8. **Questions** : faut-il garder les méthodes statiques (`Todo.findMany`,
   application active implicite) ou passer à un accès lié à l'application ?
   Un `typeName` partagé doit-il devenir une valeur d'enum réutilisable ?
   La liste d'opérations exposées doit-elle être unique pour REST et GraphQL ?
   Le défaut `{ connect }` contre `Pointer` doit-il être unifié ?
