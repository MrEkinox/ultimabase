# D — hybride : méthodes de forme, `.with()` final (2026-10-09)

Code : `lib/` (Core + plugins + mini-runtime, copiés de `lib-short` et `lib-f`), `fixture/`,
sonde `tools/probe.mjs` (copie étendue), résultats bruts `probe-results.md`.

## 1. Forme

```ts
export const Todo = App.Schema.define({
	className: 'Todo',
	fields: (field) => ({
		title: field.string({ required: true, validate: (value) => value.trim() !== '' || 'Title is empty' }),
		priority: field.enum({ enum: TodoPriority, default: 'normal' }),   // defineEnum partagé
		assignee: field.pointer({ target: () => TodoUser, onDelete: 'setNull' }),
		/* archived, allowedPriorities (enumList), status, parent, subtasks, tags */
	}),
})
	.softDelete()
	.with({
		access: {
			read: { where: ({ where }) => where.eq('archived', false) },
			update: { where: ({ where, userId }) => where.is('assignee', (user) => user.eq('id', userId)) },
			delete: { where: () => ({ assignee: { is: { email: { endsWith: '@admin.test' } } } }) },
		},
		acl: { default: () => ACL.none().grantRole('TodoRole', 'read', 'update') },
		hooks: { beforeUpdate: ({ item }) => { if (item.isDeleted) throw new TypeError('Deleted todos are read-only') } },
		postgres: { table: 'todos', indexes: [{ fields: ['archived', 'priority'] }] },
	})
// ultimabase.ts : new App({ schemas: [TodoUser, TodoRole, Todo, Tag] }) + declare module '@ultimabase/core' { interface Register { readonly app: typeof ultimabase } }
```

Écarts avec la spécification : aucun dans le code de `Todo`. `userId` est typé `string`
(filtres exécutés pour une requête authentifiée) pour garder `user.eq('id', userId)` sans
`?? ''`. `@ultimabase/core` est un vrai paquet (lien symbolique vers `lib/`), plugins via
`@ultimabase/core/plugins`. Hook de champ : `hooks: { fields: { displayName: { resolveInput: ({ value }) => value.trim() } } }`.
Fabriques : `App.PasswordUserSchema.define({...}).with({...})`, `App.RoleSchema.define({ className, members: () => TodoUser, fields }).with({...})`.

## 2. Compilation

`./tsc -p forms/d-hybrid/fixture` : **0 erreur**, aucun TS7022/TS2615/TS2589. Filtres croisés
User→Todo, Todo→User, Role→User, Tag→Todo→User (2 sauts) ; 11 assertions exactes, 8
`@ts-expect-error` effectifs (`usage.ts`). Avec ou sans la ligne `Register` : 0 erreur.

## 3. Les 8 fautes (`node tools/probe.mjs fixture`, avec `Register`)

| # | Faute | Détectée | Sur la ligne | Diag. | Premier message (longueur) |
| --- | --- | --- | --- | --- | --- |
| 1 | `() => TodoUsr` | oui | oui | 3 | `Cannot find name 'TodoUsr'. Did you mean 'TodoUser'?` (52) ; + 2 dans `usage.ts` (cible `any`) |
| 2 | `where.eq('archivd')` | oui | oui | 1 | `…not assignable to parameter of type 'ScalarKeys<"Todo">'.` (89) |
| 3 | `emial` (objet, Todo→TodoUser) | oui | oui | 1 | `…'emial' does not exist in type 'Where<"TodoUser">'. Did you mean to write 'email'?` (136) |
| 4 | `item.isDeletd` | oui | oui | 1 | `Property 'isDeletd' does not exist on type 'Readonly<{ acl: ACL; … }>'. Did you mean 'isDeleted'?` (392) |
| 5 | `mappedBy: 'asignee'` | oui | **non** (`ultimabase.ts:9`) | 1 | TS2322 long (1 158) ; le texte `TodoUser.assignedTodos: mappedBy 'asignee' is not a field of Todo` est dans l'élaboration |
| 6 | `acess:` | oui | oui | 5 | `'acess' does not exist in type 'PostgresSchemaOption<"Todo"> & AccessSchemaOption<"Todo"> & …'. Did you mean to write 'access'?` (261) + 4 `any` implicites |
| 7 | `where: () => 42` (Tag) | oui | oui | 1 | `Type 'number' is not assignable to type 'AccessFilterResult<"Tag">'.` (68) |
| 8 | `select: { titel: true }` | oui | oui | 1 | `'titel' does not exist in type 'Select<DefinedSchema<"Todo", { … }>>'. Did you mean to write 'title'?` (421) |

**7/8 sur la ligne** (8/8 détectées). En plus : typo croisée en builder `ScalarKeys<"TodoUser">` (91) ;
mauvais schéma retourné dans `is` → `WhereExpression<"Todo">` vs `<"TodoUser">` (143) ; hook de champ
qui retourne un nombre (184) ; clé de hook de champ `displayNme` → `FieldHooks<"TodoUser">` (152) ;
index sur champ inconnu `priorty` → `Did you mean '"priority"'?` (91) ; `item.title = ''` → TS2540 ;
2e rôle → `TodoRole: factory 'RoleSchema' already created another registered schema` (dans un TS2322
de 1 165) ; aucun rôle → `no registered schema created by factory 'RoleSchema'` (TS2345, 1 198).
Fragilités : `.softDelete()` deux fois → 16 diagnostics en cascade ; **une méthode de forme après
`.with()` → TS7022 sur `Tag` et `ultimabase` (25 diagnostics)** : `.with` doit rester le dernier appel.
`className: 42` → 26 diagnostics (cascade de l'appel générique, identique en A′).

## 4. Infobulles

| Point | Avec `Register` | Sans `Register` |
| --- | --- | --- |
| `where` (paramètre) | **39** `WhereBuilder<"Todo">` | 878 |
| builder croisé `(user) =>` | **42** `WhereBuilder<"TodoUser">` | 910 |
| `item` (hook) | 390 `Readonly<{ acl: ACL; id: string; … isDeleted: boolean }>` | 390 |
| `const Todo` | 857 (`DefinedSchema<"Todo", { … }>`) | 857 |
| `.with(` | 892 (`with(rules: PostgresSchemaOption<"Todo"> & AccessSchemaOption<"Todo"> & …)`) | 1 301 |
| résultat `findMany` (+ `include`) | 373 (objet résolu) | 373 |
| `value` (hook de champ) | 25 `string` | 25 |
| `const TodoUser` (fabrique) | 894 | 894 |

## 5. Complétion et découvrabilité

- `.with({ | })` : `access, acl, hooks, postgres` — exactement les plugins installés qui ont des règles.
- Après `define({...}).` : `className, createOne, findMany, softDelete, with` ; après `.softDelete().` :
  `softDelete` disparaît. Dans `define({ className: 'Note', | })` : `fields`.
- `App.` : `PasswordUserSchema, RoleSchema, Schema, use` (+ membres de `Function` : `App` est une classe).
- Découvrable sans documentation : oui, la chaîne propose `softDelete` puis `with`, et `with` liste
  les règles. Le fait que `.with` doive être **le dernier** appel n'est pas découvrable (cf. TS7022).

## 6. `isolatedDeclarations` et JavaScript

- `lib/` (Core, plugins, runtime) : **0 erreur** avec `--isolatedDeclarations` (`isolated/tsconfig.lib.json`).
- Fixture : 16 × TS9010 (chaque `const` de schéma, `App`, l'enum, `ultimabase`, les requêtes) et
  8 × TS9007 (chaque thunk `() => X`). Un paquet qui exporte un schéma devrait annoter
  `ConfiguredSchema<'Todo', { …tous les champs… }, AppTypes<…>, …>` : irréaliste à la main.
- JavaScript : `js-check/tag.js` (copie JS de `tag.ts`) : `checkJs` 0 erreur ; infobulles identiques
  (`WhereBuilder<"Tag">` 38, `WhereBuilder<"TodoUser">` 42) ; typo croisée, `() => 42`, `acess` détectés
  sur la ligne ; le runtime enregistre le schéma JS.

## 7. Coûts

Auteur de plugin (lignes de code de `lib/plugins.ts`, types + runtime) :
- (a) règle `access` : 22 lignes dont 3 propres au mécanisme
  (`interface AccessSchemaOptions extends SchemaOptionsHKT { readonly options: AccessSchemaOption<this['schema']> }`,
  `accessPlugin = (): PluginDefinition<'access', AccessSchemaOptions, …> => ({ id: 'access', runtime: { ruleKeys: ['access'] } })`).
- (b) méthode de forme : 7 lignes (`softDelete: ShapeMethod<[], { readonly isDeleted: ScalarField<'boolean', boolean, true> }>`
  + `runtime.shapeMethods.softDelete`).
- (c) fabrique `RoleSchema` : 46 lignes (signature `define` générique écrite par le plugin, retour
  `FactorySchema<'RoleSchema', …>` fourni par Core, runtime via `SchemaKit`, `requiredFactories`).

Développeur (lignes non vides hors commentaires) : `app.ts` 12, `enums.ts` 2, `todo-user.ts` 18,
`todo-role.ts` 12, `todo.ts` 36, `tag.ts` 13, `ultimabase.ts` 13 (dont 5 pour `Register`) = **106**.
Nom de schéma : constante + `className` (2 fois) + une fois par référence. Notions : `define`,
`fields`/`field.*`, thunk `() => X`, méthodes de forme, `.with` en dernier, `where` builder,
`Register` (facultatif, une fois par application).

## 8. Exécution (`node runtime-check.mjs`)

Enregistrement réel des fichiers `.ts` du fixture (Node 24, types effacés). Collecté par schéma :
champs (dont `acl` du plugin, `isDeleted` de `.softDelete()`, `username/email` de la fabrique),
méthodes de forme, règles par plugin (`access:access`, `acl:acl`, `hooks:hooks`, `postgres:postgres`).
Filtres évalués avec un builder runtime : `Todo.update = {"assignee":{"is":{"id":{"eq":"u1"}}}}`,
`Tag.read` à deux sauts, hook `beforeUpdate` qui lève, `resolveInput('  Ada  ') = "Ada"`. Refusés au
runtime : 2e rôle, aucun rôle, règle `acess` sans plugin propriétaire.

## 9. Générateur

`node forms/d-hybrid/gen.mjs <N> [--no-register]` → `forms/d-hybrid/gen/d-hybrid-<N>/` (ou
`d-hybrid-noreg-<N>/`), même graphe que `tools/gen.mjs` (`.softDelete().with({...})`, `Register`),
compatible `tools/bench.mjs` (`usage.ts` : `hoverProbe = q0`, `eq: 'valid'` ; `s0.ts` : `f5: field.string(),`).
Preuve : `./tsc -p …/d-hybrid-10` et `-50` : 0 erreur ; `noreg-10` : 0 erreur. Contrôle indicatif
unique à 10 (non comparable, charge 2,0) : 31 295 instanciations, check 0,30 s (r-10 de la nuit : 31 611).

## 10. Risques

- Repose sur le chemin rapide de TypeScript (dernier appel non générique typé sans ses arguments) :
  une méthode de forme placée après `.with` donne TS7022 loin de la cause (cas 16).
- Hovers courts seulement avec `Register` ; sans lui, rien ne signale la perte (hovers ×20).
- `const Todo` et `.with(` restent longs (857 / 892) ; erreur `mappedBy` à l'enregistrement, longue.
- Erreur dans l'objet de `define` (`className`, champ mal formé au niveau de l'objet) : cascade (26).
- Messages de requêtes longs (`Select<DefinedSchema<…>>`, 421) : `findMany` lit `TSelf`, pas le registre.
- Fabriques : chaque plugin écrit sa signature `define` (46 lignes pour les rôles).
