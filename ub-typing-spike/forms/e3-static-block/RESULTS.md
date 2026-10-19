# E3 — bloc statique, une méthode par plugin

Fichiers : `lib/` (Core 454 lignes ; plugins identiques à E1), `fixture/`,
`probe-output.md`, `faults-output.md`, `runtime/` + `runtime-check.mjs`, `js/`,
`gen.mjs`, `scratch/`.

## 1. Forme

```ts
export class Todo extends App.Schema('Todo', (field) => ({ /* champs identiques à E1 */ })).softDelete() {
	static {
		this.access({
			read: { where: ({ where }) => where.eq('archived', false) },
			update: { where: ({ where, userId }) => where.is('assignee', (user) => user.eq('id', userId ?? '')) },
		})
		this.acl({ default: () => privateAcl.grantRole('admin', 'read', 'update') })
		this.hooks({ beforeUpdate: ({ item }) => { if (item.isDeleted) throw new TypeError('Deleted todos are read-only') } })
		this.postgres({ table: 'todos', indexes: [{ fields: ['archived', 'priority'] }] })
	}
}
```

Côté Core (générique, aucun nom de plugin) : les méthodes sont dérivées des options
déclarées par les plugins (même `SchemaOptionsHKT` qu'E1/E2) :

```ts
export type RuleMethods<H> = {
	readonly [K in keyof SchemaOptionsFor<H, never>]-?: <TSelf>(this: TSelf, options: RuleOptions<H, TSelf, K>) => void
}
```

Clés calculées sans schéma ; `this: TSelf` générique pour la même raison qu'E2 (un
`this` polymorphe serait lié à la base). Un bloc statique ne contribue jamais au type
de la classe : aucune inférence, aucun cycle possible. Écarts : ceux d'E1.

## 2. Compilation

`./tsc -p forms/e3-static-block/fixture` : **0 erreur**. Mêmes 10 assertions et 7
`@ts-expect-error` qu'E1 ; `negative.ts` : 4 refus attendus.

## 3. Les 8 fautes

| Faute | Détectée | Sur la ligne | Diag. | Premier message (longueur) |
| --- | --- | --- | --- | --- |
| 1 `() => TodoUsr` | oui | oui | 3 | `Cannot find name 'TodoUsr'. Did you mean 'TodoUser'?` (59) |
| 2 `'archivd'` | oui | oui | 1 | `… parameter of type 'ScalarKeys<typeof Todo>'.` (101) |
| 3 `'emial'` | oui | oui | 1 | `… parameter of type 'ScalarKeys<typeof TodoUser>'.` (103) |
| 4 `item.isDeletd` | oui | oui | 1 | `Property 'isDeletd' does not exist on type 'Todo'. Did you mean 'isDeleted'?` (83) |
| 5 `mappedBy: 'asignee'` | oui | **non** (`ultimabase.ts`) | 1 | `SchemaRegistrationError<"TodoUser.assignedTodos: mappedBy 'asignee' is not a field of Todo">` (169) |
| 6 `this.acess(` | oui | oui | 7 | `Property 'acess' does not exist on type 'typeof Todo'. Did you mean 'access'?` (**84**) ; +6 `any` implicites |
| 7 `where: () => 42` | oui | oui | 1 | `Type 'number' is not assignable to type 'AccessFilterResult<typeof Tag>'.` (80) |
| 8 `select: { titel }` | oui | oui | 1 | `'titel' does not exist in type 'Select<typeof Todo>'. Did you mean to write 'title'?` (145) |

**7/8 sur la ligne** ; faute 6 : le message le plus court de la famille. En plus :
clé fausse dans `this.access({ delet })` → `'delet' does not exist in type
'AccessOptions<typeof Tag>'` (152) ; plugin `access` retiré de `App` → TS2339 sur
chaque `this.access(` (22 diagnostics en tout dans la fixture, cascades `any`
comprises). Refus d'enregistrement : deuxième `RoleSchema` (176), membres ajoutés
(318), `static options = {…}` (habitude E1/E2) refusé comme membre statique ajouté
(221), aucun `RoleSchema` (279).

## 4. Infobulles

| Point | Texte | Longueur |
| --- | --- | --- |
| nom de classe | `class Todo` | 10 |
| `where` | `(parameter) where: WhereBuilder<typeof Todo>` | 44 |
| cible croisée | `(parameter) user: WhereBuilder<typeof TodoUser>` | 47 |
| `item` | `(parameter) item: Todo` | 22 |
| `this.access(` | `(property) access: <typeof Todo>(this: typeof Todo, options: AccessOptions<typeof Todo>) => void` | **96** |
| `this.hooks(` | `… options: HooksOptions<typeof Todo>) => void` | 94 |
| `.softDelete` | comme E1 | 699 |
| résultat `findMany` | objet résolu | 325 |

## 5. Complétion et découvrabilité

- Après `this.` dans le bloc de `Todo` : `access, acl, hooks, postgres` (les 4 plugins
  à règles installés, **exactement**), mêlés à `className, findMany, findOne, createOne`
  et aux membres de `Function` (17 entrées). Dans `TodoUser` (fabrique, `softDelete`
  non appelé) : en plus `softDelete`, `signUp`, `login` (20) — appeler `this.softDelete()`
  dans le bloc est permis par les types et ne fait rien d'utile.
- Après `App.Schema(...).` : `softDelete` et les 4 méthodes de règles. `App.` : comme E1.
- Découvrabilité : la meilleure de la famille (une méthode par plugin, JSDoc du plugin
  sur la méthode), mais il faut savoir qu'un bloc `static {}` est attendu.

## 6. `isolatedDeclarations` et JavaScript

- `lib/` : 0 erreur. Fixture : TS9021 ×12, TS9010 ×13, **aucun TS9012** (le bloc ne
  déclare rien).
- JavaScript : même code en JS ; `checkJs` sur `js/tag.mjs` : 0 diagnostic, faute
  volontaire de `js/tag-checked.js` signalée. Exécution : `JsTag` enregistré.
  Blocs statiques : ES2022 (Node ≥ 16.11).

## 7. Coûts

- Auteur de plugin : identique à E1/E2 (8 / 5 / ≈ 25 lignes) ; la méthode `access` vient
  de l'option déclarée, rien de plus à écrire. Core : `RuleMethods` (2 types, 6 lignes).
- Développeur : `todo.ts` 34, `todo-user.ts` 17, `todo-role.ts` 13, `tag.ts` 14,
  `app.ts` 12, `ultimabase.ts` 6 lignes non vides. Nom écrit **2 fois**. Aucun
  boilerplate par application. Concept propre : 1 (bloc `static` + `this.<plugin>()`).

## 8. Exécution (`node forms/e3-static-block/runtime-check.mjs`)

Chaque méthode de règle (une par clé d'option de plugin installé) range ses options
dans une `WeakMap` par classe ; l'enregistrement les lit puis **scelle** la classe.
Collecte identique à E1. Refus : deuxième `RoleSchema`, membres ajoutés, `static
options`, `this.acess` (« is not a function »), deux appels `this.access` (« already
declared »), et **`Todo.access({ read: true })` après `new App` →
`Todo: rules are sealed after registration (access)`**. Le scellement n'existe qu'à
l'exécution : `negative.ts` contient le même appel tardif, accepté par TypeScript.

## 9. Générateur

`node forms/e3-static-block/gen.mjs <N> [racine]` → `forms/e3-static-block/gen/e3-static-block-<N>/`
(4 appels `this.access/hooks/acl/postgres` par schéma). N = 10 et 50 : 0 erreur.
Indicatif (N = 10) : check 0,34 s, 37 484 instanciations, 72 Mo.

## 10. Risques

- Règles par effets de bord à l'évaluation de la classe : invisibles dans le type de la
  classe, donc **aucune vérification de type globale** possible (règle manquante,
  doublon, appel tardif, `this.access` hors du bloc : seulement à l'exécution).
- Une classe importée mais jamais enregistrée garde des règles modifiables.
- Complétion de `this.` mêlée (`Function`, requêtes, méthodes de forme, statiques de
  fabrique). `mappedBy` à l'enregistrement ; cascade `any` sur `acess` comme E1.
