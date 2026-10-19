# G — classe repensée (en-tête = données, corps = règles)

Code : `lib/`, `fixture/` (+ `register.ts`), `fixture-noreg/` (sans registre), `micro/`, `tools/probe.mjs`
(copie qui indique la ligne fautive), `results-probe*.md`, `runtime-check.mjs`, `js/`, `gen.mjs`.

## 1. Forme

```ts
export const App = UltimaBase.use(postgresPlugin(), accessPlugin(), hooksPlugin(), aclPlugin(), softDeletePlugin(), rolesPlugin(), passwordAuthPlugin())
export const { field } = App                                           // app.ts
export class Todo extends App.Schema('Todo', {
	title: field.string({ required: true, maxLength: 200 }),
	priority: field.enum(TodoPriority, { default: 'normal' }),          // defineEnum partagé
	allowedPriorities: field.enum(TodoPriority, { list: true }),
	status: field.enum(['open', 'inProgress', 'done'], { default: 'open' }),
	assignee: field.pointer(() => TodoUser, { onDelete: 'setNull' }),
	parent: field.pointer(() => Todo),
	subtasks: field.relation(() => Todo, { mappedBy: 'parent' }),
	tags: field.relation(() => Tag), /* … */
}, { softDelete: true, postgres: { table: 'todos', indexes: [{ fields: ['archived', 'dueAt'] }] } }) {
	static access = this.rules.access({
		read: { where: (todo) => todo.eq('archived', false) },
		update: { where: (todo, { userId }) => todo.is('assignee', (user) => user.eq('id', userId ?? '')) },
	})
	static acl = this.rules.acl({ default: (data) => new ACL().grantRole('TodoRole', 'read', 'update') })
	static hooks = this.rules.hooks({ beforeUpdate: ({ item }) => { if (item.isDeleted) throw new TypeError('…') } })
}
export class TodoRole extends App.RoleSchema('TodoRole', { description: field.string() }, { members: () => TodoUser }) { … }
export class TodoUser extends App.PasswordUserSchema('TodoUser', { displayName: field.string({ required: true }), … }) {
	static hooks = this.rules.hooks({ fields: { displayName: { resolveInput: (value) => value.trim() } } })
}
```

Écarts avec la spécification (tous nécessaires ou signalés) :

- **`static access = this.access(...)` est impossible** (`micro/m1.ts`, `micro/results.txt`) :
  TS4114 (`override` exigé), TS7022 + TS2729 (`this.access` désigne le membre statique en
  cours d'initialisation, pas la méthode de base) ; avec `static override access = super.access(...)` :
  TS2417 (la déclaration n'est pas assignable à la méthode). Retenu : `this.rules.access(...)`.
- Dans un initialiseur statique, `this` vaut **le type de base**, pas `typeof Todo` (`micro/m2.ts`) :
  les règles sont typées contre l'en-tête (`SchemaHeader<'Todo', champs>`), comme demandé.
- Les plugins fournissent le **type d'options** de chaque règle ; Core fabrique les méthodes
  (paramètre lu paresseusement). Si le plugin écrit lui-même la méthode, le registre est lu pendant
  le typage de la classe : TS2502 sur `app`, TS2456 sur `RegisteredList`, TS2506 sur les fabriques (mesuré).
- `userId ?? ''` (le contexte porte `userId: string | null`) ; hook de champ `resolveInput` déclaré
  dans le corps (`this.rules.hooks({ fields: … })`) ; `postgres` (table + index typés par les champs
  déclarés) est une option d'en-tête ; `findOne` rend `Todo | null`, `findMany()` sans projection rend `Todo[]`.

## 2. Compilation

`./tsc -p forms/g-class/fixture` : **0 erreur** ; `fixture-noreg` (sans `Register`) : **0 erreur**. Aucun TS7022/TS2615/TS2589 ; filtres croisés User→Todo, Todo→User, Role→User et Tag→Todo→User (deux sauts). `usage.ts` : 10 assertions exactes (dont le résultat complet d'un `findMany` avec `include`, `one: Todo | null`, `created: Todo`, `signUp → TodoUser`), 7 `@ts-expect-error` effectifs.

## 3. Les 8 fautes (`node forms/g-class/tools/probe.mjs forms/g-class/fixture`, avec `Register`)

| # | Faute | Détectée | Sur la ligne | Diag. | Premier message (longueur) |
| --- | --- | --- | --- | --- | --- |
| 1 | `() => TodoUsr` | oui | oui | 3 (assertion + `@ts-expect-error` de usage) | `Cannot find name 'TodoUsr'. Did you mean 'TodoUser'?` (52) |
| 2 | `todo.eq('archivd', …)` | oui | oui | 1 | `…not assignable to parameter of type 'ScalarKeys<"Todo">'.` (89 ; sans registre 391) |
| 3 | `emial` (Todo → TodoUser) | oui | oui | 1 | `…'emial' does not exist in type 'Where<"TodoUser">'. Did you mean to write 'email'?` (136 ; 141) |
| 4 | `item.isDeletd` | oui | oui | 1 | `Property 'isDeletd' does not exist on type 'Todo'. Did you mean 'isDeleted'?` (76 ; 266) |
| 5 | `mappedBy: 'asignee'` | oui | non (`ultimabase.ts:7`) | 1 | `…SchemaRegistrationError<"TodoUser.assignedTodos: mappedBy 'asignee' is not a field of Todo">…` (338) |
| 6a | `this.rules.acess(` | oui | oui | 6 (4 `any` implicites + enregistrement) | `Property 'acess' does not exist on type 'RuleMethods<…, SchemaHeader<"Todo", …>>'. Did you mean 'access'?` (334) |
| 6b | `static acess =` | oui | non (enregistrement) | 1 | `…SchemaRegistrationError<"Todo.acess: static member is not a rule of an installed plugin">…` (320) |
| 7 | `where: () => 42` | oui | oui | 1 | `Type 'number' is not assignable to type 'AccessFilterResult<"Tag">'.` (68 ; 249) |
| 8 | `select: { titel: true }` | oui | oui | 2 (+ assertion) | `…'titel' does not exist in type 'Select<typeof Todo>'. Did you mean to write 'title'?` (138) |

**7/8 sur la ligne** (mappedBy à l'enregistrement ; la faute de clé de règle est sur la ligne quand elle porte sur la méthode, à l'enregistrement quand elle porte sur le nom du membre statique). Cas en plus : option d'en-tête `sofDelete` → ligne, `Type 'true' is not assignable to type 'true & UnknownSchemaOption<"sofDelete">'` (159, +3 en cascade) ; champ d'index `archivd` → ligne, `Did you mean '"archived"'?` ; méthode statique ajoutée → enregistrement `"Todo.complete: static member is not a rule of an installed plugin"` (326) ; méthode d'instance → `"Todo: instance member 'label' is not allowed (models are immutable data)"` (340) ; règle sous un autre nom → `"Tag.hooks: assign this.rules.hooks(...) to this static member"` ; second `RoleSchema` → 2 erreurs `"…App.RoleSchema may create exactly one registered schema"` ; aucun `RoleSchema` → `'~missingSchema'` (509). Limite du modèle commun (pas de la forme) : `select: { titel: true, dueAt: true }` n'est pas signalé (type faible satisfait par les autres clés).

## 4. Infobulles (avec `Register` / sans)

| Point | Avec registre | Sans |
| --- | --- | --- |
| `where` local `(todo) =>` | 38 `todo: WhereBuilder<"Todo">` | 750 (`WhereBuilder<SchemaHeader<"Todo", Readonly<{…}>>>`) |
| constructeur croisé `(user) =>` (1 et 2 sauts) | 42 `WhereBuilder<"TodoUser">` | 47 `WhereBuilder<typeof TodoUser>` |
| hook `item` | **22** `item: Todo` | 440 (objet résolu) |
| nom de classe `Todo` | 10 `class Todo` | 10 |
| membre `static access` | 49 `Todo.access: RuleDeclaration<"access">` | 49 |
| entrée `this.rules.access(` | 80 `access: (options: AccessOptions<"Todo">) => RuleDeclaration<"access">` | 787 |
| `this.rules` | 955 | 1 139 |
| `App.Schema(` | 1 606 | 1 606 |
| résultat `findMany` + `include` | 364 (objet résolu) | 364 |
| `findOne` sans projection / `signUp` | `Promise<Todo \| null>` / 24 `const signedUp: TodoUser` | idem |

## 5. Complétion et découvrabilité

`this.rules.` → `access, acl, hooks` (exactement les plugins installés) ; `this.` → `access, acl, hooks` (déjà déclarés), `className, createOne, findMany, findOne, rules` + membres de `Function` ; `App.` → `field, PasswordUserSchema, RoleSchema, Schema, use` (+ `Function`) ; options d'en-tête dans `{ }` → `postgres, softDelete` ; `indexes: [{ fields: [''] }]` → champs déclarés. On découvre `rules` puis les règles sans documentation ; en revanche la convention « membre statique du même nom » ne se découvre que par l'exemple JSDoc et l'erreur d'enregistrement.

## 6. `isolatedDeclarations` et JavaScript

- `lib/` (types, Core, plugins) : **0 diagnostic** (`isolated/tsconfig.lib.json`, `.d.ts` émis).
- Fixture : 30 diagnostics (`isolated/fixture-diagnostics.txt`) : TS9021 ×14 (`extends` d'une
  expression, y compris chaque thunk de l'en-tête), TS9012 ×7 (membres statiques : `static access:
  RuleDeclaration<'access'> = …` suffit), TS9010 ×8 (constantes), TS9019 ×1 (`export const { field } = App`).
  L'en-tête ne peut pas être annoté à la main de façon réaliste : un schéma fourni par un paquet
  devrait publier un `.d.ts` construit (pas d'`isolatedDeclarations`).
- JavaScript (`js/note.js`) : `node js/run.mjs` enregistre `Note` (champs, `softDelete`, `access`, `hooks`) ;
  `checkJs` : 0 erreur, règles typées (filtre à 3 sauts, `item`), fautes `displayNme`/`isDeletd` sur la ligne.

## 7. Coûts

Auteur de plugin (lignes non vides, types + exécution) :

```ts
export interface AccessRuleOptions<TSchema> { /** … */ readonly access: AccessOptions<TSchema> }   // (a) 8 lignes
export interface AccessRules extends RulesHKT { readonly rules: AccessRuleOptions<this['schema']> }
export const accessPlugin = (): PluginDefinition<'access', AccessRules> => ({ id: 'access', runtime: { rules: ['access'] } })
```

(b) option de forme `softDelete` : 15 lignes (options, HKT dont `added` dépend de `this['input']`, plugin) ;
(c) fabrique `RoleSchema` : 45 lignes (signature, champs et statiques possédés, HKT `required`, exécution).

Développeur (lignes non vides) : `todo.ts` 38, `todo-user.ts` 17, `todo-role.ts` 8, `tag.ts` 12, `app.ts` 5, `priority.ts` 2, `ultimabase.ts` 6, `register.ts` 7 (facultatif). Notions : `UltimaBase.use`
+ plugins, `field.*` (dont `pointer(() => X)`), `defineEnum`, `App.Schema` / `App.RoleSchema` /
`App.PasswordUserSchema`, options d'en-tête, `static <règle> = this.rules.<règle>(…)`, `ACL`,
`new App({ schemas })`, (`Register`) : 9 (+1). Nom du schéma écrit **2 fois** (classe et `'Todo'`).
Gabarit par application : `export const { field } = App` (1 ligne) + `Register` (5 lignes, facultatif).

## 8. Exécution (`node forms/g-class/runtime-check.mjs`)

Node 24 charge directement la fixture TS (types effacés). Collecté : par schéma les champs (déclarés, possédés par la fabrique, système, `acl`, `isDeleted` seulement pour `Todo`), les options d'en-tête (`{"softDelete":true,"postgres":{…}}`) et les règles lues sur les membres statiques (`Todo: access[read,update,delete,create], acl[default], hooks[beforeUpdate,beforeCreate]`) ; le filtre `read` s'exécute sur un constructeur factice. Rejetés : méthode statique, méthode d'instance, règle sous un autre nom, second `RoleSchema`, `RoleSchema` absent, option d'en-tête inconnue (6/6). Rien n'est muté : les déclarations sont gelées et lues par `Object.getOwnPropertyNames`.

## 9. Générateur

`node forms/g-class/gen.mjs <N> [--register]` → `forms/g-class/gen/g-class-<N>/` (forme de la spec) ou `g-class-reg-<N>/` (+ `Register`). Même graphe que `tools/gen.mjs` (6 scalaires, anneau `next`, `prevs` `mappedBy`, `parent` 1/5, `access` local + croisé, `hooks`, `acl`, `postgres` + `softDelete` en en-tête), marqueurs de `tools/bench.mjs` présents. `./tsc -p` : `g-class-10`, `g-class-50`, `g-class-reg-10`, `g-class-reg-50` : **0 erreur**. Contrôle unique, indicatif : 10 schémas, 40 549 instanciations, check 0,36 s (E au §5 du rapport : 27 403 ; non comparable, autre jour).

## 10. Risques

- Forme demandée (`this.access`) impossible ; `this.rules.access` ajoute un niveau ; la convention
  « nom du statique = nom de la règle » et `mappedBy` ne sont vérifiés qu'à l'enregistrement (300–500 car.).
- Sans `Register`, les infobulles locales sont longues (750 / 440 / 787) : l'en-tête est anonyme et
  `this` n'est jamais `typeof Todo`. Le registre est indispensable pour l'ergonomie, et son oubli est silencieux.
- Invariant fragile côté Core : aucun type lu pendant le typage d'un membre statique ne doit atteindre
  le registre (méthodes fabriquées par Core, paramètre paresseux). À protéger par un test de cycle.
- Faute sur `this.rules.<règle>` : 6 diagnostics ; méthodes et champs du corps refusés seulement à
  l'enregistrement ; instanciations plus élevées que E à 10 schémas (contrôles par membre statique), à mesurer.
