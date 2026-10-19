# E2 — `static options = this.with({...})`

Fichiers : `lib/` (Core 467 lignes ; plugins identiques à E1), `fixture/`,
`probe-output.md`, `faults-output.md`, `runtime/` + `runtime-check.mjs`, `js/`,
`gen.mjs`, `scratch/` (tentative 1 et sa sonde, isolatedDeclarations).

## 1. Forme

```ts
export const App = UltimaBase.use(postgresPlugin(), accessPlugin(), hooksPlugin(), aclPlugin(), softDeletePlugin(), rolesPlugin(), passwordAuthPlugin())

export class Todo extends App.Schema('Todo', (field) => ({ /* champs identiques à E1 */ })).softDelete() {
	static options = this.with({
		access: { read: { where: ({ where }) => where.eq('archived', false) },
			update: { where: ({ where, userId }) => where.is('assignee', (user) => user.eq('id', userId ?? '')) } },
		acl: { default: () => privateAcl.grantRole('admin', 'read', 'update') },
		hooks: { beforeUpdate: ({ item }) => { if (item.isDeleted) throw new TypeError('Deleted todos are read-only') } },
		postgres: { table: 'todos', indexes: [{ fields: ['archived', 'priority'] }] },
	})
}
```

Aucun alias `Options` dans `app.ts`. Écarts : ceux d'E1 (`userId ?? ''`, `use` variadique,
`.softDelete()` méthode de forme).

### Signature de `with` : deux tentatives

| Tentative | Signature | Compile | Infobulles |
| --- | --- | --- | --- |
| 1 (comme `e-class-configure`) | `with(options: SchemaOptionsFor<H, this>): SchemaRules<this>` | schémas oui ; contrôle d'enregistrement non | `where` **798**, `item` 500, `options` 708, `.with(` 1 080 |
| 2 (retenue) | `with<TSelf>(this: TSelf, options: SchemaOptionsFor<H, TSelf>): SchemaRules<TSelf>` | **0 erreur** | `where` **44**, `item` 22, `options` 49, `.with(` 407 |

Cause de l'échec 1 (`scratch/probe-attempt1.md`) : le `this` polymorphe d'un membre
statique **hérité** est lié au type de la base (`SchemaBase<"Todo", …>`), pas à
`typeof Todo` ; les règles restent justes (mêmes champs) mais tout s'imprime en
structure, et `options` n'est pas `SchemaRules<typeof Todo>`. C'est aussi ce qui donnait
639 à `e-class-configure`. Le paramètre `this: TSelf` générique résout `TSelf` =
`typeof Todo` depuis le récepteur seul : aucun cycle ici (contrairement à
`configure<TSelf>(options)` du rapport, où `TSelf` était inféré des options).

## 2. Compilation

`./tsc -p forms/e2-this-with/fixture` : **0 erreur**, aucun TS7022/TS2615/TS2589. Mêmes
10 assertions et 7 `@ts-expect-error` qu'E1 ; `negative.ts` : 5 refus attendus.
Essai complémentaire (non conservé) : filtre objet croisé à deux sauts
(`assignee.is.assignedTodos.some`) dans `this.with` : 0 erreur.

## 3. Les 8 fautes

| Faute | Détectée | Sur la ligne | Diag. | Premier message (longueur) |
| --- | --- | --- | --- | --- |
| 1 `() => TodoUsr` | oui | oui | 3 | `Cannot find name 'TodoUsr'. Did you mean 'TodoUser'?` (59) |
| 2 `'archivd'` | oui | oui | 1 | `… parameter of type 'ScalarKeys<typeof Todo>'.` (101) |
| 3 `'emial'` | oui | oui | 1 | `… parameter of type 'ScalarKeys<typeof TodoUser>'.` (103) |
| 4 `item.isDeletd` | oui | oui | 1 | `Property 'isDeletd' does not exist on type 'Todo'. Did you mean 'isDeleted'?` (83) |
| 5 `mappedBy: 'asignee'` | oui | **non** (`ultimabase.ts`) | 1 | `SchemaRegistrationError<"TodoUser.assignedTodos: mappedBy 'asignee' is not a field of Todo">` (169) |
| 6 `acess:` | oui | oui | 7 | `'acess' does not exist in type 'PostgresSchemaOption<typeof Todo> & AccessSchemaOption<typeof Todo> & HooksSchemaOption<typeof Todo> & AclSchemaOption<typeof Todo> & Readonly<...>'. Did you mean to write 'access'?` (274) ; +6 `any` implicites |
| 7 `where: () => 42` | oui | oui | 1 | `Type 'number' is not assignable to type 'AccessFilterResult<typeof Tag>'.` (80) |
| 8 `select: { titel }` | oui | oui | 1 | `'titel' does not exist in type 'Select<typeof Todo>'. Did you mean to write 'title'?` (145) |

**7/8 sur la ligne**. Faute 6 : message presque deux fois plus long qu'E1 (pas d'alias
nommé pour l'intersection). Refus d'enregistrement : deuxième `RoleSchema` (176), membres
ajoutés (318), options en objet simple (R3) et options **empruntées à une autre classe**
(`static options = Unannotated.with({})`, R5) : `static options must be created with
this.with({ ... }) in the class body`, aucun `RoleSchema` (279).

## 4. Infobulles

| Point | Texte | Longueur |
| --- | --- | --- |
| nom de classe | `class Todo` | 10 |
| `where` | `(parameter) where: WhereBuilder<typeof Todo>` | 44 |
| cible croisée | `(parameter) user: WhereBuilder<typeof TodoUser>` | 47 |
| `item` | `(parameter) item: Todo` | 22 |
| `options` | `(property) Todo.options: SchemaRules<typeof Todo>` | 49 |
| `.with(` | `(method) SchemaRulesEntry<readonly [PostgresSchemaOptions, …]>.with<typeof Todo>(this: typeof Todo, options: PostgresSchemaOption<typeof Todo> & AccessSchemaOption<typeof Todo> & …): SchemaRules<typeof Todo>` | 407 |
| `.softDelete` | comme E1 | 699 |
| résultat `findMany` | objet résolu | 325 |

**Oui, `this.with` garde les infobulles courtes d'E**, à condition d'être générique sur
`this` (tentative 2).

## 5. Complétion et découvrabilité

- Dans `this.with({ | })` : `access, acl, hooks, postgres` (plugins installés).
- Après `this.` dans l'initialiseur : `options, with`, `className, findMany, findOne,
  createOne` + membres de `Function`. Après `App.Schema(...).` : `softDelete, with`, …
- `App.` : comme E1. Découvrabilité meilleure qu'E1 : `with` apparaît dans la complétion
  de la classe, avec JSDoc et exemple ; reste à savoir l'écrire dans un `static`.

## 6. `isolatedDeclarations` et JavaScript

- `lib/` : 0 erreur. Fixture : TS9021 ×12 (comme E1), TS9010 ×14, **TS9012 ×6** (une par
  `static options = this.with(...)` : il faudrait annoter `SchemaRules<typeof Todo>`).
- JavaScript : **le même code fonctionne en JS sans rien ajouter**. `checkJs` sur
  `js/tag.mjs` : 0 diagnostic (callbacks typés, aucun `any` implicite) ; la faute
  volontaire de `js/tag-checked.js` (`() => 42`) est signalée. Exécution : `JsTag`
  enregistré par `runtime-check.mjs`.

## 7. Coûts

- Auteur de plugin : identique à E1 (8 / 5 / ≈ 25 lignes). Côté Core, l'entrée
  `with` = 1 interface de 3 lignes utiles, générique, sans nom de plugin.
- Développeur : `todo.ts` 34, `todo-user.ts` 17, `todo-role.ts` 13, `tag.ts` 14,
  `app.ts` 12, `ultimabase.ts` 6 lignes non vides. Nom écrit **2 fois** (`class Todo`,
  `'Todo'`). Aucun boilerplate par application. Concept propre : 1 (`static options =
  this.with(...)`).

## 8. Exécution (`node forms/e2-this-with/runtime-check.mjs`)

`with` (statique de la base) reçoit la classe appelante comme `this` (initialiseur
statique) et renvoie un jeton gelé mémorisé dans une `WeakMap` (classe + options).
Collecte identique à E1. Refus : deuxième `RoleSchema`, membres ajoutés, clé `acess`,
options d'une autre classe, réaffectation de `options` après enregistrement.

## 9. Générateur

`node forms/e2-this-with/gen.mjs <N> [racine]` → `forms/e2-this-with/gen/e2-this-with-<N>/`,
même graphe qu'E1. N = 10 et 50 : 0 erreur. Indicatif (N = 10) : check 0,32 s,
39 153 instanciations, 77 Mo.

## 10. Risques

- Repose sur deux comportements de TypeScript peu documentés : `this` dans un
  initialiseur statique, et l'inférence de `TSelf` par le seul récepteur sans lire les
  callbacks pendant le typage de `options`. Prouvé sur la fixture et à 50 schémas, pas
  au-delà ; une variante non générique « marche » mais avec des infobulles longues,
  sans erreur pour le signaler.
- Message de la faute 6 long (274) ; TS9012 par schéma sous `isolatedDeclarations`.
- `options` doit venir du même `this.with` : contrôlé à l'enregistrement seulement.
- `mappedBy` à l'enregistrement ; cascade `acess` comme E1.
