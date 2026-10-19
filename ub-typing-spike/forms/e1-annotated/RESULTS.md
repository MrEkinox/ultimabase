# E1 — classe, options annotées

Fichiers : `lib/` (Core 450 lignes commentaires compris, `types.ts`, `plugins.ts`),
`fixture/` (`src/`, `probe.json`), `probe-output.md`, `faults-output.md`,
`runtime/` + `runtime-check.mjs`, `js/`, `gen.mjs`, `scratch/` (isolatedDeclarations).

## 1. Forme

```ts
// app.ts, une fois par application
export const App = UltimaBase.use(postgresPlugin(), accessPlugin(), hooksPlugin(), aclPlugin(), softDeletePlugin(), rolesPlugin(), passwordAuthPlugin())
export type Options<TSchema> = SchemaOptionsOf<typeof App, TSchema>

export class Todo extends App.Schema('Todo', (field) => ({
	title: field.string({ required: true, validate: (title) => title.length > 0 || 'title is empty' }),
	priority: field.enum({ values: TodoPriority, default: 'normal' }),            // defineEnum partagé
	allowedPriorities: field.enum({ values: TodoPriority, list: true }),
	assignee: field.pointer({ target: () => TodoUser, onDelete: 'setNull' }),
	/* archived, status, parent, subtasks, tags */
})).softDelete() {
	static readonly options: Options<typeof Todo> = {
		access: { read: { where: ({ where }) => where.eq('archived', false) },
			update: { where: ({ where, userId }) => where.is('assignee', (user) => user.eq('id', userId ?? '')) } },
		acl: { default: () => privateAcl.grantRole('admin', 'read', 'update') },
		hooks: { beforeUpdate: ({ item }) => { if (item.isDeleted) throw new TypeError('Deleted todos are read-only') } },
		postgres: { table: 'todos', indexes: [{ fields: ['archived', 'priority'] }] },
	}
}
export class TodoUser extends App.PasswordUserSchema('TodoUser', (field) => ({
	displayName: field.string({ required: true, hooks: { resolveInput: ({ value }) => value.trim() } }), /* … */ })) { /* options */ }
export class TodoRole extends App.RoleSchema('TodoRole', { members: () => TodoUser, fields: (field) => ({ description: field.string() }) }) { /* options */ }
```

Écarts avec la spécification : `userId ?? ''` (le contexte d'accès type `userId: string | null`,
comme `lib/`) ; `UltimaBase.use(...)` variadique ; `.softDelete()` est une **méthode de forme**
fournie par le plugin (emplacement générique `shapeMethods`), plus un champ ajouté partout.
`App.PasswordUserSchema(name, fields)` reprend la signature de `App.Schema`.

## 2. Compilation

`./tsc -p forms/e1-annotated/fixture` : **0 erreur** (aucun TS7022/TS2615/TS2589).
`usage.ts` : 10 assertions exactes, 7 `@ts-expect-error` effectifs ; `negative.ts` : 4
refus d'enregistrement attendus (`@ts-expect-error`).

## 3. Les 8 fautes (`node forms/e1-annotated/faults.mjs forms/e1-annotated/fixture`)

| Faute | Détectée | Sur la ligne | Diag. | Premier message (longueur) |
| --- | --- | --- | --- | --- |
| 1 `() => TodoUsr` | oui | oui | 3 | `Cannot find name 'TodoUsr'. Did you mean 'TodoUser'?` (59) ; +2 dans `usage.ts` (cible `any`) |
| 2 `'archivd'` | oui | oui | 1 | `Argument of type '"archivd"' is not assignable to parameter of type 'ScalarKeys<typeof Todo>'.` (101) |
| 3 `'emial'` (TodoUser depuis Todo) | oui | oui | 1 | `… parameter of type 'ScalarKeys<typeof TodoUser>'.` (103) |
| 4 `item.isDeletd` | oui | oui | 1 | `Property 'isDeletd' does not exist on type 'Todo'. Did you mean 'isDeleted'?` (83) |
| 5 `mappedBy: 'asignee'` | oui | **non** (`ultimabase.ts`) | 1 | `… SchemaRegistrationError<"TodoUser.assignedTodos: mappedBy 'asignee' is not a field of Todo">` (169) |
| 6 `acess:` | oui | oui | 7 | `'acess' does not exist in type 'Options<typeof Todo>'. Did you mean to write 'access'?` (147) ; +6 `any` implicites |
| 7 `where: () => 42` | oui | oui | 1 | `Type 'number' is not assignable to type 'AccessFilterResult<typeof Tag>'.` (80) |
| 8 `select: { titel }` | oui | oui | 1 | `'titel' does not exist in type 'Select<typeof Todo>'. Did you mean to write 'title'?` (145) |

**7/8 sur la ligne** (`mappedBy` à l'enregistrement). Tentative pour le ramener dans le
fichier du schéma (contrôle ajouté au type `Options`) : erreur sur la ligne `options`,
mais message illisible (307 caractères, le texte utile caché dans l'élaboration) :
abandonnée. Autres refus (tous à `new App`, messages lisibles) : deuxième `RoleSchema`
(176), membres statique/instance ajoutés (318, les deux nommés), options non annotées
(188 : `static options must be annotated with Options<typeof Unannotated>`), aucun
`RoleSchema` enregistré (279). Sans `.softDelete()`, `item.isDeleted` → TS2339 sur la ligne.

## 4. Infobulles

| Point | Texte | Longueur |
| --- | --- | --- |
| nom de classe | `class Todo` | 10 |
| `where` | `(parameter) where: WhereBuilder<typeof Todo>` | 44 |
| cible croisée | `(parameter) user: WhereBuilder<typeof TodoUser>` | 47 |
| `item` (hook) | `(parameter) item: Todo` | **22** (E : 427) |
| entrée des règles | `(property) Todo.options: Options<typeof Todo>` | 45 |
| `.softDelete` | `() => SchemaBase<"Todo", { … }, InstallOne<…>, unknown, "softDelete">` | 699 |
| résultat `findMany` + `include` | objet résolu | 325 |
| `findOne` annoté | `const one: Todo \| null` | 22 |
| `resolveInput` | `(parameter) value: string` | 25 |

`item: Todo` vient d'un changement de Core propre aux classes : la signature de
construction de la base renvoie le modèle, donc **le type d'instance `Todo` est le
modèle** ; `Item<S>` = type d'instance. `const one: Todo | null = await Todo.findOne(...)`
compile (assignabilité structurelle exacte, assertion T10).

## 5. Complétion et découvrabilité

- Dans `options: Options<typeof Tag> = { | }` : `access, acl, hooks, postgres` (exactement
  les plugins à options installés). Dans `access: { | }` : clés restantes.
- `App.` : `PasswordUserSchema, RoleSchema, Schema, use` + membres de `Function`
  (`apply, bind, call, …`).
- Après `App.Schema(...).` : `softDelete`, `className, findMany, findOne, createOne` +
  membres de `Function`.
- Découvrabilité : faible. Rien dans `App.Schema(...)` n'indique qu'il faut écrire
  `static readonly options` ni l'alias `Options` ; un oubli d'annotation donne des
  `any` implicites (TS7006) et le refus à l'enregistrement (cas R3), pas une aide.

## 6. `isolatedDeclarations` et JavaScript

- `lib/` (Core + plugins) : **0 erreur**, `.d.ts` émis.
- Fixture : TS9021 ×12 dans les 4 schémas (une par `extends` **et** une par thunk à
  l'intérieur), TS9010 ×13 (`App`, `TodoPriority`, `ultimabase`, `usage`, `negative`).
  Pour l'éviter, il faudrait annoter la base (`const TodoBase: SchemaBase<'Todo', {…types
  des champs…}, …> = App.Schema(…)`) : types écrits deux fois. Les paquets de plugins
  n'ont rien à annoter (ils exportent des fabriques déclarées).
- JavaScript : `runtime-check.mjs` enregistre `js/tag.mjs` (copie JS) sans erreur.
  `checkJs` : sans annotation, 4 `any` implicites (TS7031/TS7006) ; avec
  `/** @type {Options<typeof JsCheckedTag>} */` (`js/tag-checked.js`), typage complet
  (la faute volontaire `() => 42` est signalée). JSDoc obligatoire en JS.

## 7. Coûts

- Auteur de plugin (`lib/plugins.ts`, commun à E1/E2/E3) : (a) entrée de règles `access` :
  8 lignes de liaison (`AccessSchemaOption` 4, HKT 3, déclaration 1) en plus des types
  d'options ; (b) méthode de forme `softDelete` : 5 lignes ; (c) fabrique `RoleSchema` :
  ≈ 25 lignes (champs possédés 4, statiques du modèle 4, signature 10, HKT 6, déclaration 1).
- Développeur (lignes non vides) : `todo.ts` 34, `todo-user.ts` 17, `todo-role.ts` 13,
  `tag.ts` 14, `app.ts` 14, `ultimabase.ts` 6. Nom du schéma écrit **3 fois**
  (`class Todo`, `'Todo'`, `typeof Todo`). Boilerplate : l'alias `Options` (1 ligne +
  import de `SchemaOptionsOf`) par application, l'annotation par schéma. Concepts propres
  à la forme : 2 (`static readonly options`, `Options<typeof X>`).

## 8. Exécution (`node forms/e1-annotated/runtime-check.mjs`)

Les fichiers TypeScript de la fixture s'exécutent tels quels (types retirés par Node 24,
`runtime/loader.mjs` redirige `lib/*.ts` vers le bouchon). Collecté par schéma : champs
(type, cible, `mappedBy`, `hooks.resolveInput` du champ), règles par plugin
(`access{read,update,delete} acl{default} hooks{beforeUpdate} postgres{table,indexes}`),
fabrique. Refus à l'exécution : deuxième `RoleSchema`, membres `archiveAll`/`save`, clé
`acess` sans plugin, réaffectation de `Todo.options` après enregistrement (classe gelée).
Avant l'enregistrement, `readonly` n'est qu'un type : `Todo.options = …` reste possible.

## 9. Générateur

`node forms/e1-annotated/gen.mjs <N> [racine]` → `forms/e1-annotated/gen/e1-annotated-<N>/`
(racine par défaut dans le dossier de la forme, règle « travailler dans forms/ » ;
`racine` doit rester sous le spike, qui fournit `"type": "module"`). Même graphe et
densité que `tools/gen.mjs`, plus `.softDelete()` sur chaque schéma (équivaut au champ
`isDeleted` global de `lib/`), marqueurs de `tools/bench.mjs` conservés. N = 10 et 50 :
0 erreur. Indicatif (1 exécution, N = 10) : check 0,29 s, 37 786 instanciations, 68 Mo.

## 10. Risques

- Annotation oubliable ; en JS, JSDoc obligatoire. Nom écrit trois fois.
- `readonly` non garanti avant l'enregistrement ; gel seulement après.
- `mappedBy` vu seulement à l'enregistrement (comme D/E).
- Contrôle des membres ajoutés : à l'enregistrement seulement (les méthodes restent
  écrivables dans la classe) ; message assemblé par une concaténation d'union
  (`JoinMessages`), coûteuse seulement en cas d'erreur.
- Cascade de 6 `any` implicites sur `acess:` ; `Function` pollue la complétion.
