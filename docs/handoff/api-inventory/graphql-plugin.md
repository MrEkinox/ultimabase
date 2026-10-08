# Fiche : `@ultimabase/graphql-plugin`

Sources : `packages/graphql-plugin/README.md`, `src/plugin.ts`,
`src/options.ts`, `src/surfaces.ts`, `src/connection-limits.ts`. Sondes :
`gen/notes` (REST + GraphQL générés par `create-app`), `probe/app.ts`,
`probe/misconfig.ts`, PostgreSQL 17 sous Docker.

## 1. Rôle et installation

Compile un `GraphQLSchema` exécutable par application à partir du graphe
Core, sans réseau. Fournit l'exécution sans réseau (`execute`,
`printSchema`) ; le transport HTTP est `graphql-yoga-plugin`. S'installe
avant la déclaration des schémas pour typer l'option `graphql`.

| Option                            | Défaut                  | Remarque                                                                                                              |
| --------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `acknowledgeUnverifiedProtection` | absent → `console.warn` | Identique à REST : tait un avertissement émis même avec Access/ACL installés.                                         |
| `default`                         | défaut intégré          | get, findOne, findMany, exists, create, update, delete activés ; count, upsert désactivés ; `mutations: true`.        |
| `limits`                          | voir ci-dessous         | 100 KiB de document, 10 000 jetons, profondeur 20, 100 alias, 20 champs racine, 1 MiB de variables, page 25, max 100. |
| `operations`                      | `[]`                    | Jetons d'opérations exposés ; liste en double avec REST.                                                              |
| `schemas`                         | `[]`                    | `GraphQLSchema` complets (Pothos, Nexus…) fusionnés strictement.                                                      |

Option de schéma : `graphql: boolean | { typeName?, operations?: boolean |
{ get, findOne, findMany, count, exists, create, update, delete, upsert,
mutations, bulk } }`. Une couche de plus que `rest: {…}` et d'autres noms
(`findMany`/`findOne` contre `find`/`first`).

Ce qui est exposé par défaut, sans plugin de politique : lecture **et
écriture** anonymes pour chaque schéma d'application (mesuré en REST : `201`
pour un `POST` anonyme ; non rejoué en GraphQL, mais même défaut intégré et
même pipeline Runtime).

## 2. Ce qu'il apporte

- Racines générées : `get<T>`, `findOne<T>`, `findMany<T>` (connexion Relay
  `edges`/`nodes`/`pageInfo`, sans `totalCount`), `count<T>` et `exists<T>`
  si activés ; `create<T>`, `update<T>`, `delete<T>`, `upsert<T>`, bulk ;
  mutations de plugins (`archivePost`) ; opérations de plugins sélectionnées.
- Filtres par capacité de champ, tri en liste ordonnée, écritures imbriquées
  (`connect`/`create`/`update`/`disconnect`/`set`/`clear`), champs virtuels.
- Curseurs signés par une clé aléatoire **par vie d'application** : tout
  curseur devient invalide après un redémarrage ou sur une autre instance
  (déploiement à plusieurs répliques derrière un répartiteur : curseurs
  inutilisables d'une réplique à l'autre). Pagination par décalage
  (doublons/sauts possibles sous écriture concurrente, documenté).
- Erreurs : extensions `{ code, requestId, retryable }` ; exceptions
  inconnues masquées en `INTERNAL_SERVER_ERROR`.
- Échec au démarrage si aucun champ de requête public n'existe : mesuré
  (`probe/misconfig.ts`, application sans schéma) →
  `GraphqlSchemaCompilationError: GraphQL schema compilation requires at least
one public query field`. Une application qui démarre « vide » ou dont tous
  les schémas sont masqués ne peut pas installer GraphQL.

Mesures (`gen/notes`, requêtes avec en-tête d'application) :

| Requête                                            | Résultat                                                                            |
| -------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `{ findManyTask(first: 10) { nodes { id } } }`     | 200, correct                                                                        |
| `mutation { createTask(...) }` (écritures coupées) | 400 « The mutation operation is not supported by the schema. »                      |
| `{ countTask }` (count désactivé)                  | « Cannot query field countTask… Did you mean getTask? » (pas d'indice sur l'option) |

## 3. API pour le développeur

```ts
const SchemaApplication = UltimaBase.use(graphqlPlugin())
const Post = SchemaApplication.Schema.define({
	className: 'Post',
	fields: (field) => ({ title: field.string() }),
	graphql: { operations: { count: true } },
})
// Exécution sans réseau (tests, scripts)
const graphql = application.plugin('@ultimabase/graphql-plugin')
const context = application.anonymous({
	requestId: crypto.randomUUID(),
	source: 'internal',
}).context
await graphql.execute({
	context,
	document: '{ findManyPost(first: 10) { nodes { id } } }',
})
```

Résolveurs personnalisés (`schemas: [custom]`) : contexte exact
`{ request: RequestContext }` ; pour lire les données, appeler
`Post.findMany(input, { context: request })`.

Opération personnalisée : la liaison GraphQL du propriétaire exige une
métadonnée de type écrite en AST
(`examples/minimal/src/status-plugin.ts` l. 85-118 : 34 lignes pour un
objet à deux champs), plus le jeton dans `graphqlPlugin({ operations })`.

## 4. Frictions mesurées

- L'exécution sans réseau exige de fabriquer un contexte
  (`application.anonymous({ requestId, source })`) : 2 concepts de plus pour
  un test.
- `graphqlPlugin()` sans `graphqlYogaPlugin()` : aucune route, aucun signal.
  `graphqlYogaPlugin()` sans `graphqlPlugin()` : erreur claire (« requires
  missing plugin »).
- Avertissement d'acquittement à chaque démarrage, comme REST.
- `typegen: false` sur l'option `graphql` alors que `rest` déclare une
  référence Typegen : traitement incohérent de deux options jumelles.

## 5. Dépendances à Typegen

L'option `graphql` est typée depuis la source. Les documents GraphQL et
leurs résultats ne sont pas typés côté client (aucun codegen GraphQL fourni ;
le SDL est disponible via `printSchema()` pour un outil externe). Aucune
dépendance bloquante.

## 6. Propositions

1. **Même défaut sûr que REST** : sans fournisseur de politique, mutations
   générées absentes du SDL ; suppression de
   `acknowledgeUnverifiedProtection` (voir fiche REST, propositions 1-2).
2. **Opérations exposées par défaut** quand leur propriétaire fournit une
   liaison GraphQL ; option `hide` pour restreindre.
3. **Description de type commune** pour les opérations : le propriétaire
   décrit son résultat une fois (même constructeur que les champs virtuels :
   `output.object({ fields })`), GraphQL et REST en dérivent leurs formes.
   - Avant : 34 lignes d'AST `{ kind: 'non-null', ofType: { kind: 'named', name: 'String' } }`.
   - Après : `result: (o) => o.object({ name: 'ExampleStatus', fields: (f) => ({ authority: f.string(), principalId: f.id({ nullable: true }) }) })`.
4. **Aplatir l'option de schéma** : `graphql: { count: true, typeName: 'Article' }`
   au lieu de `graphql: { operations: { count: true } }` ; mêmes clés que
   REST.
5. **Application sans champ public** : avertissement au lieu d'un échec (ou
   champ `_empty` documenté), pour pouvoir installer GraphQL avant le premier
   schéma exposé.
6. **Clé de curseur configurable** (`cursorSecret`) pour les déploiements à
   plusieurs répliques et les redémarrages ; défaut aléatoire conservé.
7. **Indice dans l'erreur de validation** quand un champ racine existe mais
   est désactivé : extension `hint: "enable graphql: { count: true } on Task"`.

## 7. Note sur la grille

| Critère                | Note actuelle                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| Sans génération        | Conforme côté serveur ; pas de typage client.                                                   |
| Colocalisation         | Bonne pour l'exposition de schéma ; opérations listées à part et en double.                     |
| Concision              | Bonne pour le CRUD ; faible pour une opération (AST de type à la main).                         |
| Une forme par concept  | Faible : `graphql.operations.x` contre `rest.x`, noms divergents.                               |
| Révélation progressive | Moyenne : acquittement, écriture ouverte par défaut, échec sans champ public.                   |
| Erreurs                | Bonne pour GraphQL standard ; pas d'indice sur les options désactivées.                         |
| Hovers                 | Non mesuré.                                                                                     |
| Performance TypeScript | Option de schéma petite ; non mesuré isolément.                                                 |
| JavaScript             | Conforme.                                                                                       |
| Coût de migration      | Moyen : graphql-plugin, liaisons des propriétaires (password-auth), exemples, create-app, site. |
