# G′ — G avec `Self` (à la Effect Schema)

Code : `lib/` (copie de `g-class/lib` sans registre, références par type d'instance), `fixture/`,
`results-probe.md`, `runtime-check.mjs`, `js/`, `isolated/`, `gen.mjs`. Probe : `node forms/g-self/tools/probe.mjs forms/g-self/fixture`.

## 1. Forme

```ts
export class Todo extends App.Schema<Todo>()('Todo', {
	title: field.string({ required: true, maxLength: 200 }),
	assignee: field.pointer(() => TodoUser, { onDelete: 'setNull' }),
	parent: field.pointer(() => Todo), /* … mêmes champs que G … */
}, { softDelete: true, postgres: { table: 'todos', indexes: [{ fields: ['archived', 'dueAt'] }] } }) {
	static access = this.rules.access({
		read: { where: (todo) => todo.eq('archived', false) },
		update: { where: (todo, { userId }) => todo.is('assignee', (user) => user.eq('id', userId ?? '')) },
	})
	static hooks = this.rules.hooks({ beforeUpdate: ({ item }) => { if (item.isDeleted) throw new TypeError('…') } })
}
export class TodoRole extends App.RoleSchema<TodoRole>()('TodoRole', { description: field.string() }, { members: () => TodoUser }) { … }
export class TodoUser extends App.PasswordUserSchema<TodoUser>()('TodoUser', { … }) { … }
```

Écarts avec la spécification : les mêmes que G (`this.rules.access` au lieu de `this.access`, voir
`../g-class/micro/m1.ts` ; `userId ?? ''` ; hook de champ dans le corps ; `postgres` en en-tête).
Mécanisme : `Todo` (type d'instance) porte une marque fantôme (symbole) avec `className` et champs ;
les règles sont typées contre lui ; les cibles de relation sont imprimées comme types d'instance
(`TodoUser`). `App.Schema<Self = unknown>(...missing)` exige un argument quand `Self` manque, pour
signaler l'oubli sur l'en-tête.

## 2. Compilation

`./tsc -p forms/g-self/fixture` : **0 erreur**, sans aucun registre. **Pas de TS2506 ni TS7022** : `Todo`
nommé dans sa propre expression `extends` n'est lu que par des positions paresseuses (paramètres des
règles). Mêmes graphes croisés que G (deux sens, deux sauts, fabriques Role ↔ User), mêmes assertions (10) et `@ts-expect-error` (7).

## 3. Les 8 fautes

| # | Faute | Détectée | Sur la ligne | Diag. | Premier message (longueur) |
| --- | --- | --- | --- | --- | --- |
| 1 | `() => TodoUsr` | oui | oui | 3 | `Cannot find name 'TodoUsr'. Did you mean 'TodoUser'?` (52) |
| 2 | `todo.eq('archivd', …)` | oui | oui | 1 | `Argument of type '"archivd"' is not assignable to parameter of type 'ScalarKeys<Todo>'.` (87) |
| 3 | `emial` (Todo → TodoUser) | oui | oui | 1 | `…'emial' does not exist in type 'Where<TodoUser>'. Did you mean to write 'email'?` (134) |
| 4 | `item.isDeletd` | oui | oui | 1 | `Property 'isDeletd' does not exist on type 'Todo'. Did you mean 'isDeleted'?` (76) |
| 5 | `mappedBy: 'asignee'` | oui | non (enregistrement) | 1 | `…SchemaRegistrationError<"TodoUser.assignedTodos: mappedBy 'asignee' is not a field of Todo">…` (338) |
| 6a | `this.rules.acess(` | oui | oui | 6 | `Property 'acess' does not exist on type 'RuleMethods<readonly [NoRules, AccessRules, …], Todo>'. Did you mean 'access'?` (165) |
| 6b | `static acess =` | oui | non (enregistrement) | 1 | `…"Todo.acess: static member is not a rule of an installed plugin"…` (320) |
| 7 | `where: () => 42` | oui | oui | 1 | `Type 'number' is not assignable to type 'AccessFilterResult<Tag>'.` (66) |
| 8 | `select: { titel: true }` | oui | oui | 2 | `…'titel' does not exist in type 'Select<typeof Todo>'. Did you mean to write 'title'?` (138) |

**7/8 sur la ligne**, messages les plus courts de la famille sans aucune ligne de configuration.
Cas d'enregistrement en plus (méthode statique, méthode d'instance, règle sous un autre nom, second
`RoleSchema`, `RoleSchema` absent, champ d'index) : identiques à G.

Cas propres à `Self` :

| Faute | Diag. | Sur la ligne de l'en-tête | Premier message |
| --- | --- | --- | --- |
| `App.Schema<Tag>()('Todo', …)` (mauvaise classe) | 8 | non : erreurs dans les règles + enregistrement | `…'"archived"' is not assignable to parameter of type 'ScalarKeys<Tag>'.` (87) ; enregistrement : `"Todo: write App.Schema<Todo>() (the type argument names another class)"` |
| `App.Schema()(…)` (oubli) | 12 | oui | `Expected 1 arguments, but got 0.` (32 ; information liée : `typeArgument`), puis chaque règle : `…not assignable to parameter of type '"Name the class being declared: class Todo extends App.Schema<Todo>()(...)"'` |
| `App.RoleSchema<TodoUser>()` (fabrique, mauvaise classe) | 3 | non | `…'"members"' is not assignable to parameter of type 'RelationKeys<TodoUser>'.` (93) + enregistrement |
| `App.Schema<Tg>()` (faute de frappe) | 6 | oui | `Expected 1 arguments, but got 0.` puis `Cannot find name 'Tg'.` |
| `App.RoleSchema()(…)` (oubli, fabrique) | 6 | oui | `Expected 1 arguments, but got 0.` |

Vérifier `Self` sur l'en-tête même est impossible : il faudrait résoudre `Todo` pendant le typage de sa
propre classe de base (cycle). La mauvaise classe n'est donc dite qu'à l'enregistrement.

## 4. Infobulles (sans registre)

| Point | Longueur et texte |
| --- | --- |
| `where` local `(todo) =>` | **36** `todo: WhereBuilder<Todo>` |
| constructeur croisé `(user) =>` (1 et 2 sauts) | **40** `user: WhereBuilder<TodoUser>` |
| hook `item` | **22** `item: Todo` |
| nom de classe / `<Todo>` | 10 `class Todo` |
| membre `static access` | 49 `Todo.access: RuleDeclaration<"access">` |
| entrée `this.rules.access(` | **78** `access: (options: AccessOptions<Todo>) => RuleDeclaration<"access">` |
| `this.rules` | 431 (`SchemaStatics<…>.rules: RuleMethods<…, Todo>`) |
| `App.Schema<Todo>()(` | 534 |
| résultat `findMany` + `include` | 364 (objet résolu) ; `findOne` → `Promise<Todo \| null>` ; `signUp` → `TodoUser` (24) |

Deux identités imprimées pour un même schéma : `Todo` dans les règles, `typeof Todo` dans les requêtes (`Select<typeof Todo>`).

## 5. Complétion et découvrabilité

Identique à G : `this.rules.` → `access, acl, hooks` ; `App.` → `field, PasswordUserSchema, RoleSchema, Schema, use` ;
options d'en-tête `postgres, softDelete`. Le motif `App.Schema<Todo>()(` n'est pas découvrable par complétion :
seuls l'exemple JSDoc et l'erreur `Expected 1 arguments` (information liée `typeArgument`) le guident.

## 6. `isolatedDeclarations` et JavaScript

- `lib/` : **0 diagnostic**. Fixture : 30 diagnostics, mêmes codes et mêmes nombres que G (TS9021 ×14,
  TS9012 ×7, TS9010 ×8, TS9019 ×1) ; mêmes conséquences pour les schémas fournis par un paquet.
- JavaScript : à l'exécution, `js/note.js` (`App.Schema()('Note', …)`) s'enregistre normalement.
  **`checkJs` : inutilisable** — JavaScript n'a aucune syntaxe pour l'argument de type explicite :
  `Expected 1 arguments, but got 0.` puis règles non typées (7 diagnostics : `any` implicites et message `Self`).

## 7. Coûts

Auteur de plugin : règle et option de forme identiques à G (8 et 15 lignes). Fabrique : un niveau
d'appel de plus et le contrôle `SelfArgument` (`<TSelf = unknown>(...missing: SelfArgument<TSelf>): RoleSchemaHeader<TApp, TSelf>`) :
**50 lignes** (G : 45). Développeur : mêmes lignes que G (`todo.ts` 38, `todo-user.ts` 17, `todo-role.ts` 8,
`tag.ts` 12, `app.ts` 5, `ultimabase.ts` 6), **aucun** `register.ts` ; nom écrit **3 fois** par
déclaration (`class Todo`, `<Todo>`, `'Todo'`) ; une notion de plus (`<Self>()` et l'appel curryfié `()(`).

## 8. Exécution (`node forms/g-self/runtime-check.mjs`)

Même résultat que G : champs, options d'en-tête et règles collectés pour les 4 schémas ; filtre `read`
exécuté ; 6/6 rejets (méthode statique, méthode d'instance, règle sous un autre nom, second et aucun
`RoleSchema`, option inconnue). À l'exécution, `App.Schema()` renvoie simplement la fonction d'en-tête.

## 9. Générateur

`node forms/g-self/gen.mjs <N>` → `forms/g-self/gen/g-self-<N>/` (`class S0 extends App.Schema<S0>()('S0', …)`,
sinon identique au générateur G). `./tsc -p` : `g-self-10`, `g-self-50` : **0 erreur**. Contrôle unique,
indicatif : 10 schémas, 41 878 instanciations, check 0,37 s.

## 10. Risques

- Syntaxe inhabituelle (`<Todo>()(`), nom écrit trois fois ; un mauvais `Self` donne des erreurs
  trompeuses dans les règles (`ScalarKeys<Tag>`) avant le vrai diagnostic, à l'enregistrement seulement.
- Inutilisable en JavaScript vérifié (`checkJs`).
- Marque fantôme sur les instances (symbole non exporté) : invisible en complétion, mais fait partie du
  type modèle ; deux identités affichées (`Todo` / `typeof Todo`).
- Fabriques de plugin : chaque auteur doit reproduire le niveau `Self` et le contrôle d'oubli.
- Même dépendance que G aux contrôles d'enregistrement pour `mappedBy` et pour les membres du corps.
