# L — règles au niveau de l'application

Code : `lib/`, `fixture/` (sans registre), `registry-alt/` (registre par tuple de schémas),
`runtime-check.mjs`, `js/`, `gen.mjs`, `tools/`, `scratch/m.ts` (micro-test du typage
contextuel). Sorties : `results-probe*.md`, `runtime-check-output.txt`.

## 1. Forme

```ts
// todo.ts : données seulement
export const Todo = App.Schema.define({ className: 'Todo', softDelete: true, fields: (field) => ({ … }) })
// ultimabase.ts : toutes les règles, clés = className
export const ultimabase = new App({
	schemas: [TodoUser, TodoRole, Todo, Tag],
	rules: {
		Todo: {
			access: { read: { where: ({ where }) => where.eq('archived', false) },
				update: { where: ({ where, userId }) => where.is('assignee', (user) => user.eq('id', userId)) } },
			acl: { default: () => acl.grantRole('TodoRole', 'read', 'update') },
			hooks: { beforeUpdate: ({ item }) => { if (item.isDeleted) throw new TypeError('Deleted todos are read-only') } },
			postgres: { table: 'todos', indexes: [{ fields: ['status', 'dueAt'] }] },
		},
		TodoUser: { … }, TodoRole: { … }, Tag: { … },
	},
})
```

Écarts : aucun dans le code développeur. Typage Core :
`new <const TSchemas>(options: { schemas: TSchemas & CheckedSchemas<TSchemas>; rules?: ApplicationRules<HKTs, TSchemas> })`
avec `ApplicationRules = { [K in keyof SchemasByClassName<TSchemas>]?: SchemaRulesFor<HKTs, SchemaRef<SchemasByClassName<TSchemas>[K]>> }`.
**Piège trouvé** : mapper directement l'union (`[S in TSchemas[number] as NameOf<S>]`) perd le
typage contextuel de tous les callbacks (16 × TS7031/TS7006 sur la fixture ; reproduit dans
`scratch/m.ts`, même avec deux arguments) ; une table `className → schéma` puis `keyof` marche.

## 2. Verdict de compilation

Fixture : **0 erreur**. Générés 10/50/200 (avec et sans registre) : 0 erreur.
Registre d'application `Register { app: typeof ultimabase }` : **échec, cycle** —
`TS7022 'ultimabase' implicitly has type 'any' …`, `TS2502 'app' is referenced directly or
indirectly in its own type annotation`, `TS2456 Type alias 'RegisteredList' circularly
references itself` (les callbacks de l'appel lisent le registre qui lit le type de l'appel).
Alternative qui compile (`registry-alt/`) : `export const schemas = [TodoUser, TodoRole, Todo, Tag] as const`
+ `Register { schemas: typeof schemas }` + `new App({ schemas, rules })` (forme du registre C).

## 3. Les 8 fautes (`results-probe.md` ; registre : `results-probe-registry.md`)

| # | Faute | Détectée | Sur la ligne | Diag. | Premier message (longueur sans / avec registre) |
| --- | --- | --- | --- | --- | --- |
| 1 | `() => TodoUsr` | oui | oui | 2 | `Cannot find name 'TodoUsr'. Did you mean 'TodoUser'?` (52) |
| 2 | `where.eq('archivd', …)` | oui | oui | 1 | `ScalarKeys<DefinedSchema<"Todo", {…}>>` (385) / `ScalarKeys<"Todo">` (89) |
| 3 | `emial` | oui | oui | 1 | `Where<DefinedSchema<"TodoUser", …>>`… `Did you mean to write 'email'?` (439 / 136) |
| 4 | `item.isDeletd` | oui | oui | 1 | `…on type 'Readonly<{ acl: ACL; … }>'. Did you mean 'isDeleted'?` (337 / 326) |
| 5 | `mappedBy: 'asignee'` | oui | **non** (`ultimabase.ts:11`) | 1 | TS2719 illisible (743 ; élaboration 1 224, 1 970 avec registre) |
| 6 | `acess:` dans `rules.Todo` | oui | oui | 5 | `'acess' does not exist in type 'PostgresRuleTypes<DefinedSchema<…>> & …'. Did you mean to write 'access'?` (440 / 219) ; + 4 `any` implicites |
| 7 | `where: () => 42` | oui | oui | 1 | `AccessFilterResult<DefinedSchema<"Tag", …>>` (363) / `AccessFilterResult<"Tag">` (68) |
| 8 | `select: { titel: true }` | oui | oui | 2 | `'titel' does not exist in type 'Select<…>'. Did you mean to write 'title'?` (429) |

**8/8 détectées, 7/8 sur la ligne.** 8b (faute à côté de clés valides) : non signalée sur la
ligne, comme partout.

Cas propres à L :

| Cas | Détecté | Message |
| --- | --- | --- |
| L1 `Todoo:` (className faux) | ligne, 5 diag. (+4 `any`) | `'Todoo' does not exist in type 'ApplicationRules<readonly [PostgresRules, …], readonly [DefinedSchema<…'. Did you mean to write 'Todo'?` (438 ; la suggestion arrive après ~400 caractères de type) |
| L2 règles d'un schéma absent de `schemas` | ligne de `Tag:`, 4 diag. | TS2353 `'Tag' does not exist in type 'ApplicationRules<…>'` (406) |
| L3 entrée oubliée | **0 diagnostic**, accepté au démarrage | entrées facultatives ; les rendre obligatoires imposerait `Tag: {}` |
| L4 deuxième `RoleSchema` | `schemas`, 2 diag. | TS2719 long |
| L5 `sofDelete: true` | ligne, 30 diag. | cascade (perte des champs de `define`) |
| L6 mauvais schéma retourné dans `is` | ligne | `'WhereExpression<"Todo">' is not assignable to type 'WhereExpression<"TodoUser">'` (87) |

## 4. Infobulles (sans registre / registre par tuple)

| Point | Sans | Avec |
| --- | --- | --- |
| `where` | 824 | **39** |
| cible croisée `(user) =>` | 787 | **42** |
| cible à deux sauts (Tag) | 823 | **38** |
| hook `item` | 414 | 414 |
| `const Todo` | 890 | 890 |
| `rules: {` | **1 342** | 1 263 (imprime `ApplicationOptions<HKTs, [tous les schémas]>`) |
| entrée `Todo: {` | 893 | **117** `Todo?: PostgresRuleTypes<"Todo"> & AccessRuleTypes<"Todo"> & …` |
| `const ultimabase` | 889 | 810 |
| résultat `findMany` | 364 | 364 |

## 5. Complétion et découvrabilité

- `rules: {|` : les className des schémas enregistrés **pas encore écrits** (sonde
  `completion-probe.ts` : `Todo`) ; `Tag: {|` : `access, acl, hooks, postgres` (+ JSDoc des plugins).
- `App.` : `PasswordUserSchema, RoleSchema, Schema, use` ; `TodoRole.` : `addMember, className,
  createOne, findMany` — **rien sur le schéma n'indique où sont ses règles**.
- Découvrable sans documentation : depuis `new App({|` (propriété `rules`, JSDoc) oui ; depuis le
  schéma, non.

## 6. `isolatedDeclarations` et JavaScript

- `lib/` : 0 diagnostic. Fixture : 14 × TS9010 + 8 × TS9007 (constantes de schéma, thunks) ;
  les règles sont dans l'expression `new App(...)` : seule `ultimabase` est à annoter
  (`Application<…>`, type long à écrire).
- JavaScript (`js/todo-role.js` données + `js/ultimabase.js` règles) : s'exécute ; `checkJs`
  0 erreur ; `idd`, `acess`, `TodoRol:` signalés sur la ligne (`results-probe-js.md`).

## 7. Coûts

Auteur de plugin : identique à K/K′ (8 / 16 / 41 lignes).

Développeur : 108 lignes non vides (ultimabase 48, todo 21, todo-user 9, tag 9, todo-role 7,
app 12). Concepts : `define`, options de forme, `rules` par className. `Todo` écrit 14 fois ;
le className sert aussi de clé de règles (renommer `className` casse la clé, signalé).
**Colocalisation** : les règles de `Todo` sont dans un autre fichier (`ultimabase.ts:27-42`)
que son schéma (`todo.ts:7-22`), contre 1 ligne d'écart en K (`todo.ts:24` → `26`) et en K′.
Le fichier d'application grossit d'environ 15 lignes par schéma : 160 lignes à 10 schémas,
760 à 50, **3 010 à 200** (générateur) — au-delà de la limite de 600 lignes du dépôt dès ~40
schémas. Découper les règles par fichier fait perdre le typage contextuel (il vient de
l'appel `new App`), sauf annotation explicite d'un type dépendant de l'application.

## 8. Exécution (`node runtime-check.mjs`)

Mêmes données collectées que K (champs, forme, règles par plugin ; filtres et hook exécutés).

```text
L1 Invalid application: - rules.Todoo: no registered schema has this className
L2 - Todo.tags: target is not a registered schema
   - rules.Tag: no registered schema has this className
L3 (aucune règle) : accepted
L4 - RoleSchema (plugin 'roles'): exactly one registered schema expected, got 2 (TodoRole, StaffRole)
L5 - rules.Todo.acess: unknown rule (installed: postgres, access, hooks, acl)
```

## 9. Générateur

`node forms/l-app-rules/gen.mjs <N> [--registry] [--no-soft-delete]` → `forms/l-app-rules/gen/…`
(`--registry` = tuple `as const` + `Register { schemas }`). Toutes les règles dans
`application.ts`. N = 10, 50, 200 : 0 erreur. Indicatif à 10 : 33 179 instanciations, check 0,34 s.
Note pour la mesure : l'édition de schéma de `tools/bench.mjs` revérifie `s0.ts` et `usage.ts`,
pas `application.ts` où sont les règles : le coût des règles n'y est pas compté pour L.

## 10. Risques

- Colocalisation perdue (règles loin du schéma) et fichier d'application unique qui croît
  linéairement (limite de taille du dépôt dépassée vers 40 schémas).
- Registre d'application impossible (cycle) : hovers courts seulement avec un tuple
  `as const` + `declare module` (deux concepts de plus, forme C).
- Typage fragile : une écriture naturelle du type mappé (`as`) supprime silencieusement le
  typage contextuel (callbacks `any` implicites) ; à protéger par un test de type.
- Toute modification d'une règle revérifie l'appel `new App` entier (tous les schémas) :
  granularité d'édition la plus grosse des trois (non mesuré ici).
- Oubli d'une entrée non détectable sans rendre toutes les entrées obligatoires.
- Clés = className (chaînes) : renommage par l'éditeur (`F2` sur `Todo`) ne suit pas la clé.
