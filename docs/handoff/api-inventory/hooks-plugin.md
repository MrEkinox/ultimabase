# Fiche plugin : `@ultimabase/hooks-plugin`

Phase 1 du défi API (voir [api-challenge-plan.md](../api-challenge-plan.md)).
Mesures faites sur une application sonde hors dépôt
(`node_modules/.cache/inventory-policy/src/app/*.ts` : `User` Password Auth,
`Role`, `Post` avec tous les plugins de cette fiche), typée avec
`node_modules/.bin/tsc` (strict, NodeNext, `exactOptionalPropertyTypes`,
`skipLibCheck`), avec et sans le fichier Typegen généré pour elle.

## 1. Rôle et installation

Moteur officiel du cycle de vie : options `hooks` de schéma et de champ,
exécution transactionnelle, événements post-commit.

```ts
const App = UltimaBase.use(hooksPlugin())
```

- `hooksPlugin()` n'a **aucune option** (`packages/hooks-plugin/src/plugin.ts`).
  Pas d'option inutile ni dangereuse ; pas de réglage d'ordre, de délai ou de
  désactivation globale non plus.
- L'importer n'installe rien ; une option `hooks` sans le plugin est une erreur
  de compilation de l'application (et une erreur TypeScript).
- Pas de dépendance vers un autre plugin officiel. Les fournisseurs tiers se
  branchent par `provideHookContributions()` et un `peer`.

## 2. Ce qu'il ajoute aux schémas

- Option de champ `hooks: { resolveInput }` sur les champs stockés et les
  propriétés d'objets imbriqués (pas sur les champs virtuels).
  Exemple réel : `examples/todo-backend/src/schema.ts`
  (`hooks: { resolveInput: ({ value }) => value.trim() }`).
- Option de schéma `hooks: { resolveInput, beforeOperation, afterOperation }`.
  `beforeOperation` accepte `create | update | delete` ; `afterOperation`
  accepte `create | update | upsert | delete` ; les deux acceptent en plus le
  nom de chaque mutation de plugin (`softDelete`, `restore`, `purge` avec Soft
  Delete). Exemple : `examples/minimal/src/schema.ts` (`afterOperation.purge`).
- Aucun champ, aucune route, aucune opération ajoutée.
- Chaque branche accepte un handler ou une liste non vide ; `resolveInput`
  accepte aussi la famille `{ all, create, update, upsert }`.

## 3. API pour le développeur

| Phase                 | Reçoit                                                     | Peut                                            |
| --------------------- | ---------------------------------------------------------- | ----------------------------------------------- |
| champ `resolveInput`  | `{ context, kind, mode, value }`                           | retourner une nouvelle valeur du champ          |
| schéma `resolveInput` | `{ context, kind, operation, originalItem, nestedWrite? }` | retourner une **nouvelle AST d'opération**      |
| `beforeOperation.*`   | `{ context, kind, item, originalItem, operation }`         | observer, lever une erreur, lancer des requêtes |
| `afterOperation.*`    | idem, `item` persisté, avant commit                        | observer, rejeter (rollback), `context.emit()`  |

- **Contexte** (`HookContext`, `src/context/hook-context.ts`) : `access`
  (`anonymous` ou `master`), `requestId`, `transactionId`, `signal`,
  `source`, `hook` (identité), `getValue(token)`, `hasCapability()`, `emit()`.
  Il n'y a **pas d'utilisateur courant** : il faut importer le jeton du plugin
  d'authentification (`context.getValue(passwordPrincipal)?.user`).
- **Modifier une écriture** : seul `resolveInput` transforme. Au niveau champ,
  on ne voit que la valeur du champ (pas les champs voisins). Au niveau schéma,
  on reçoit l'AST Core et on doit la reconstruire :

```ts
resolveInput: {
	create: ({ operation }) => ({
		...operation,
		input: { ...operation.input, slug: slugify(operation.input.title) },
	}),
},
```

Pour une mise à jour, `operation.update` est une
`UpdateExpression` (`{ kind: 'update-expression', operations: [...] }`,
`packages/core/src/query/updates/contracts.ts`) : ajouter un champ dérivé
signifie insérer un nœud `set` à la main. Aucun exemple de transformation
réelle n'existe dans le README ni les exemples (seulement `=> operation`).

- **Refuser** : lever une exception. Les exemples lèvent `TypeError`, qui n'est
  pas une `FrameworkError` ; côté REST elle tombe dans la réponse interne
  (`REST_INTERNAL_ERROR`, `packages/rest-plugin/src/responses.ts`, lu, non
  exécuté). Un refus « métier » propre exige
  `new FrameworkError('VALIDATION_ERROR', msg, { publicMessage })`, non
  documenté dans ce README.
- **Ordre et transaction** : ordre Runtime d'`AGENTS.md` ; handlers en ordre
  de déclaration ; tout s'exécute dans la transaction automatique ; un
  `afterOperation` qui lève annule tout. Les requêtes lancées depuis un hook
  héritent de la transaction et de l'autorité (via contexte asynchrone).
- **Post-commit** : pas de phase `afterCommit` inline. Il faut
  `defineEvent<P>()('post.created', { delivery })`, `context.emit(...)` dans le
  hook, puis **un plugin** avec `provideHookEvent('id', onEvent({ name, handler }))`
  (sonde : 22 lignes). Le consommateur se lie par **chaîne**, et son
  `event.payload` est typé `JsonDocument`, pas le type du contrat.

Comparaison :

- Parse Cloud Code : `beforeSave` modifie `request.object` directement, donne
  `request.user`, `request.original`, `request.master` ; `afterSave` est
  post-commit. Ici la modification exige l'AST et l'utilisateur exige un jeton
  d'un autre package.
- Payload : `beforeChange({ data, originalDoc, req })` retourne `data` ;
  `afterChange` après écriture. Prisma extensions : `query.$allOperations`
  avec `args` modifiables. Les deux manipulent des données, pas une AST.
- Manquent : `beforeOperation.upsert`, hooks de lecture (`beforeFind`,
  `afterFind`), `afterCommit` inline, refus typé simple.
- Surprenant : `item` dans `before/afterOperation` est un modèle complet avec
  méthodes (`get`, `toJSON`, `softDelete`… ; hover 710 caractères).

## 4. Frictions mesurées

Sonde `src/app/post.ts` (92 lignes, dont 28 pour `hooks`) : slug dérivé à la
création, auteur pris dans la session, refus de dépublication, journal après
création, refus de `softDelete` d'un article publié.

| Cas                                               | Résultat                                                                                                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hooks de champ seuls, sans fichier généré         | compile, types exacts (`value: string`)                                                                                                                |
| `hooks` de schéma, **sans** fichier généré        | `TS2345 … is not assignable to parameter of type 'never'` sur **tout** l'objet `define` (ligne 13), puis `TS7031 implicitly any` pour chaque paramètre |
| Avec fichier généré                               | compile ; erreurs lisibles pour une faute de frappe (`Property 'titel' does not exist on type 'Readonly<PostItem>'. Did you mean 'title'?`)            |
| `beforeOperation.upsert`                          | `TS2353 'upsert' does not exist in type 'Readonly<{ softDelete?: HookHandlerDeclaration<…` (485 caractères)                                            |
| `author: user.id` au lieu du `Pointer` dans l'AST | erreur de 4 niveaux, ~700 caractères par ligne, signalée sur la clé `resolveInput`, pas sur `author`                                                   |
| Génération présente mais schéma ajouté depuis     | compile ; `item` vaut `{ [x: string]: unknown }` → `item.titel` **accepté**                                                                            |
| Génération présente, champ ajouté depuis          | faux positif `Property 'subtitle' does not exist` jusqu'à la régénération                                                                              |

Hovers (language service) : `operation` 83 car. (`CreateOneOperationAst<…>`),
`originalItem` 718 car., propriété `hooks` de schéma 458 car. sans JSDoc,
`beforeOperation` 582 car., `hooks` de champ 1 135 car. Typecheck de la sonde :
~1,8 s sans génération (en erreur), ~2,6 s avec (545 lignes générées).

## 5. Dépendances à Typegen

- Option de schéma `hooks` : descripteur `typegen: { generic: 'self', module,
type: 'SchemaHooksOption' }` dans `src/plugin.ts`, injecté dans
  `UltimaBaseGeneratedSchemaOptions` (ADR-0280). Sans génération, l'option
  n'existe pas du tout dans les types, même pour un hook qui ne lit rien.
- Clés de mutations de plugin : `GeneratedMutationMap` lit
  `UltimaBaseGeneratedSchemaSurfaces[className]['schemaMutations']`
  (`src/authoring/schema-mutation-contracts.ts`), complété par
  `PluginSourceSchemaMutations`.
- Items, `operation`, relations : graphe généré (ADR-0279, 0280, 0281 pour
  `where`).
- Option de champ : source seule (`typegen: false`, `SourceFieldHooksOption`).
- JavaScript : la sonde compilée en JS est acceptée par le compilateur Runtime
  (génération réussie depuis le JS émis) ; aucune génération requise.

## 6. Propositions

1. **Modifier des données, pas une AST.** `resolveInput` de schéma reçoit et
   retourne des données ; Core convertit en `set`.

   ```ts
   // avant
   create: ({ operation }) => ({
   	...operation,
   	input: { ...operation.input, slug },
   })
   // après
   create: ({ data }) => ({ ...data, slug: slugify(data.title) })
   update: ({ changes, originalItem }) =>
   	changes.title === undefined
   		? changes
   		: { ...changes, slug: slugify(changes.title) }
   ```

   Les incréments restent atomiques (non exposés comme valeur) ; l'AST reste
   accessible aux plugins par `provideHookContributions`.

2. **Sujet neutre dans le contexte.** Core possède déjà
   `requestPrincipalResolverCapability` (utilisé par ACL). Exposer
   `context.principal` (Pointer ou `undefined`) dans `HookContext` sans que
   Core nomme un plugin :
   `const user = context.getValue(passwordPrincipal)?.user` → `context.principal`.
3. **Post-commit inline et typé.** Ajouter `afterCommit: { create: ({ item }) => … }`
   hors transaction (erreurs journalisées, sans rollback), et typer
   `onEvent(postCreated, handler)` par le contrat au lieu du nom. Avant : 3
   concepts + 1 plugin ; après : 1 clé.
4. **Refus typé.** Exporter `reject(message, details?)` (ou documenter
   `FrameworkError('VALIDATION_ERROR', …, { publicMessage })`) pour que le
   cas courant ne produise pas une erreur interne.
5. **Symétrie** : ajouter `beforeOperation.upsert` (l'Access a déjà
   `upsert.item`), ou documenter son absence.
6. **Sans génération** (pistes du laboratoire, phase 3) : contextualiser
   `hooks` après inférence de `fields` (`NoInfer`, définition en deux temps)
   ; au minimum, faire exister l'option avant génération avec un type local
   (champs du schéma, sans relations) plutôt que `never` sur l'objet entier.

## 7. Note sur la grille

Échelle 1 (mauvais) à 5 (excellent) ; pour le coût de migration, 5 = faible.

| Critère                | Note | Justification                                                                              |
| ---------------------- | ---- | ------------------------------------------------------------------------------------------ |
| Sans génération        | 1    | `hooks` de schéma absent sans fichier ; génération périmée = types lâches ou faux positifs |
| Colocalisation         | 5    | hooks écrits dans le schéma et le champ                                                    |
| Concision              | 2    | AST à reconstruire ; post-commit = 22 lignes et un plugin                                  |
| Une forme par concept  | 3    | familles `all/create/…` cohérentes, mais champ (valeur) ≠ schéma (AST)                     |
| Révélation progressive | 4    | `hooksPlugin()` sans option ; cas simple de champ trivial                                  |
| Erreurs                | 2    | `never` sur l'objet entier sans génération ; erreurs d'AST illisibles                      |
| Hovers                 | 3    | 83–718 car., mais schéma 458 car. sans JSDoc, champ 1 135 car.                             |
| Performance TypeScript | 4    | non mesurée à l'échelle ici ; sonde 2,6 s                                                  |
| JavaScript             | 5    | même graphe, validé par le compilateur Runtime                                             |
| Coût de migration      | 3    | changer `resolveInput` touche hooks, ACL, docs et exemples                                 |
