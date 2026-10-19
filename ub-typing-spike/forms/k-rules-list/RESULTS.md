# K — constante de règles + liste à l'enregistrement

Code : `lib/`, `fixture/`, `runtime-check.mjs`, `js/`, `gen.mjs`, `tools/`. Sorties : `results-probe*.md`, `runtime-check-output.txt`.

## 1. Forme

```ts
export const Todo = App.Schema.define({ className: 'Todo', softDelete: true, fields: (field) => ({ … }) })
export const todoRules = Todo.rules({
	access: { read: { where: ({ where }) => where.eq('archived', false) },
		update: { where: ({ where, userId }) => where.is('assignee', (user) => user.eq('id', userId)) } },
	acl: { default: () => acl.grantRole('TodoRole', 'read', 'update') },
	hooks: { beforeUpdate: ({ item }) => { if (item.isDeleted) throw new TypeError('Deleted todos are read-only') } },
	postgres: { table: 'todos', indexes: [{ fields: ['status', 'dueAt'] }] },
})
// ultimabase.ts
export const ultimabase = new App({ schemas: [TodoUser, TodoRole, Todo, Tag], rules: [todoUserRules, todoRoleRules, todoRules, tagRules] })
```

Écarts avec la spécification : aucun dans le code montré. Ajouts : `acl`/`postgres` dans
`rules` (exigés par la fixture) ; `userId: string` (filtre appelé seulement si authentifié,
pour garder `user.eq('id', userId)` tel quel) ; **chaque schéma enregistré doit avoir une
entrée** (`Tag.rules({})` s'il n'a aucune règle), choix de détection (§10). Registre
d'application (`fixture/register.ts`, facultatif, comme D) testé à part.

Forme du Core : `define<const TName, const TFields, const TShape extends ShapeOptionsFor<…>>(d: SchemaDeclaration<TName, TFields> & TShape)`
(options de forme des plugins, `softDelete: true` → `isDeleted`) ; `rules(rules: SchemaRulesFor<HKTs, SchemaRef<this>>): SchemaRules<TName>`,
signature unique non générique ; la constante de schéma ne dépend jamais de ses règles.

## 2. Verdict de compilation

`./tsc -p forms/k-rules-list/fixture` : **0 erreur** ; avec registre (`fixture/tsconfig.registry.json`) : 0 erreur.
Aucun TS7022/TS2615/TS2589. Générés : 10, 50 et 200 schémas, avec et sans registre : 0 erreur.

## 3. Les 8 fautes (`node tools/probe.mjs fixture`, détail : `results-probe.md`)

| # | Faute | Détectée | Sur la ligne | Diag. | Premier message (longueur sans / avec registre) |
| --- | --- | --- | --- | --- | --- |
| 1 | `() => TodoUsr` | oui | oui | 2 | `Cannot find name 'TodoUsr'. Did you mean 'TodoUser'?` (52 / 52) ; + `@ts-expect-error` inutilisé dans `usage.ts` |
| 2 | `where.eq('archivd', …)` | oui | oui | 1 | `…not assignable to parameter of type 'ScalarKeys<DefinedSchema<"Todo", {…}>>'` (385) / `'ScalarKeys<"Todo">'` (89) |
| 3 | `emial` (Todo → TodoUser) | oui | oui | 1 | `'emial' does not exist in type 'Where<DefinedSchema<"TodoUser", …>>'. Did you mean to write 'email'?` (439) / `Where<"TodoUser">` (136) |
| 4 | `item.isDeletd` | oui | oui | 1 | `Property 'isDeletd' does not exist on type 'Readonly<{ acl: ACL; … }>'. Did you mean 'isDeleted'?` (268 / 268) |
| 5 | `mappedBy: 'asignee'` | oui | **non** (`ultimabase.ts:8`) | 1 | TS2719 `Type 'import("…/lib/core").DefinedSchema<"TodoUser", …' … Two different types with this name exist` (743 / 743), texte utile (`SchemaRegistrationError<"TodoUser.assignedTodos: mappedBy 'asignee' is not a field of Todo">`) seulement dans l'élaboration (1 224) |
| 6 | `acess:` dans `Todo.rules` | oui | oui | 5 | `'acess' does not exist in type 'PostgresRuleTypes<DefinedSchema<…>> & …'. Did you mean to write 'access'?` (440) / `PostgresRuleTypes<"Todo"> & AccessRuleTypes<"Todo"> & …` (219) ; + 4 `any` implicites |
| 7 | `where: () => 42` (Tag) | oui | oui | 1 | `Type 'number' is not assignable to type 'AccessFilterResult<DefinedSchema<"Tag", …>>'` (363) / `AccessFilterResult<"Tag">` (68) |
| 8 | `select: { titel: true }` | oui | oui | 2 | `'titel' does not exist in type 'Select<DefinedSchema<"Todo", …>>'. Did you mean to write 'title'?` (429 / 429) |

**8/8 détectées, 7/8 sur la ligne** (`mappedBy` à l'enregistrement, comme toutes les
variantes du rapport). Constat commun à toutes les formes (typage des requêtes de `lib-f`) :
`select: { titel: true, dueAt: true }` (faute à côté de clés valides) n'est **pas** signalé
sur la ligne (type « faible » + `const TArgs` inféré) ; seule l'assertion de résultat casse (cas 8b).

Cas propres à K :

| Cas | Détecté (ligne) | Message |
| --- | --- | --- |
| K1 règles oubliées dans `rules: [...]` | oui (ligne `rules`) | TS2322 `… & { readonly '~missingRules': SchemaRegistrationError<"no rules entry for Tag; register X.rules({}) to declare none"> }` (309 / 574) |
| K2 règles listées deux fois | oui, sur chaque doublon (2 diag.) | `SchemaRegistrationError<"rules: Todo is listed twice">` (132) |
| K3 règles sans leur schéma | oui, sur l'entrée `tagRules` | `SchemaRegistrationError<"rules: Tag is not in schemas">` (131) |
| K4 deuxième `RoleSchema` | oui (`schemas`, 3 diag.) | TS2719 long ; `factory 'RoleSchema' already created another registered schema` dans l'élaboration |
| K5 `sofDelete: true` | oui, ligne, **29 diag.** | TS2561 `Did you mean to write 'softDelete'?` mais l'échec de l'appel `define` fait perdre les champs (`DefinedSchema<"Todo", unknown, …>`) : cascade dans tous les fichiers |
| K6 mauvais schéma retourné dans `is` | oui | `'WhereExpression<"Todo">' is not assignable to type 'WhereExpression<"TodoUser">'` (87) |

## 4. Infobulles (sans registre / avec registre)

| Point | Sans | Avec |
| --- | --- | --- |
| `where` (paramètre du filtre) | 824 `WhereBuilder<DefinedSchema<"Todo", {…}>>` | **39** `WhereBuilder<"Todo">` |
| cible croisée `(user) =>` | 787 | **42** |
| cible à deux sauts `(todo) =>` (Tag) | 823 | **38** |
| hook `item` | 414 `Readonly<{ acl: ACL; … }>` | 414 |
| `const Todo` | 803 | 890 |
| `.rules(` | 1 219 | 446 (`rules(rules: PostgresRuleTypes<"Todo"> & AccessRuleTypes<"Todo"> & …): SchemaRules<"Todo">`) |
| `const todoRules` | **36** `SchemaRules<"Todo">` | 36 |
| `rules: [` | 638 | 638 |
| `const ultimabase` | 889 | 889 |
| résultat `findMany` + `include` | 364 | 364 |

Registre (`Register { app: typeof ultimabase }`) : **aucun cycle** (contrairement à F/L) : `typeof ultimabase` ne lit que `SchemaRules<"Todo">`.

## 5. Complétion et découvrabilité

- `StaffRole.rules({|})` : `access, acl, hooks, postgres` (les plugins installés, avec leur JSDoc).
- `Todo.` / `TodoRole.` : `addMember, className, createOne, findMany, rules` — `rules` est découvert
  depuis le schéma, JSDoc « Register the result in `new App({ rules: [...] })` ».
- `App.` : `PasswordUserSchema, RoleSchema, Schema, use` (+ membres de `Function`).
- `App.Schema.define({|` : `softDelete` ; `App.RoleSchema.define({|` : `fields` (pas d'option de forme sur les fabriques ici).
- Découvrable sans documentation : oui pour `rules(` ; l'obligation de lister le résultat ne
  l'est que par la JSDoc et par l'erreur K1.

## 6. `isolatedDeclarations` et JavaScript

- `lib/` (Core, plugins, runtime) : **0 diagnostic** (`tsconfig.isolated-lib.json`).
- Fixture : 19 × TS9010 + 8 × TS9007. Par schéma : la constante (type non écrivable) et un TS9007
  par cible `() => X`. Les **constantes de règles s'annotent trivialement** :
  `export const tagRules: SchemaRules<'Tag'> = Tag.rules({...})` (vérifié : erreur levée, typage
  contextuel intact). Un paquet de plugins n'a rien à annoter dans ce modèle.
- JavaScript (`js/todo-role.js`) : s'exécute ; `checkJs` 0 erreur ; `idd`, `acess`, `TodoUsr` signalés sur la ligne.

## 7. Coûts

Auteur de plugin (non vides) : (a) entrée de règles `access` : **8 lignes** (`AccessRuleTypes` +
`AccessRules extends SchemaRulesHKT` + valeur du plugin), en plus des 18 lignes de types
d'options qu'exige toute forme ; (b) option de forme `softDelete` : **16 lignes**
(`SchemaShapeHKT` : `options` + `fields` conditionnels sur `this['declaration']`, runtime
`shapeOptions`/`shapeFields`) ; (c) fabrique `RoleSchema` : **41 lignes** (types + runtime `prepare`).
Mêmes contributions de plugin pour K, K′ et L.

Développeur (fixture, lignes non vides hors `usage.ts`) : 106 (todo 38, todo-user 17, tag 15,
todo-role 13, app 12, ultimabase 9). Concepts : `define`, options de forme, `X.rules`, liste
`rules`, `defineEnum`, fabriques. Noms : `Todo` 13 fois, et `todoRules` 3 fois (déclaration,
import, liste) ; idem pour chaque schéma. Par application : la liste `rules` (parallèle à
`schemas`), plus 5 lignes facultatives de registre.

## 8. Exécution (`node runtime-check.mjs`, sortie : `runtime-check-output.txt`)

Par schéma : champs (système, déclarés, possédés par la fabrique, `acl`, `isDeleted` si
`softDelete`), options de forme, chaque règle avec son plugin propriétaire ; filtres, hook
(`Deleted todos are read-only`), `resolveInput` et `validate` exécutés. Erreurs de démarrage :

```text
K1 Invalid application: - rules: Tag.rules(...) declared at tag.ts:12 is not listed in rules
K2 - rules: Todo has two rules entries (todo.ts:26, todo.ts:26)
K3 - Todo.tags: target is not a registered schema / - rules: rules of Tag (tag.ts:12) target a schema missing from schemas
K4 - RoleSchema (plugin 'roles'): exactly one registered schema expected, got 2 (TodoRole, StaffRole)   (got 0 sans rôle)
K5 TypeError: Todo.rules: unknown rule 'acess' (installed: postgres, access, hooks, acl)
```

## 9. Générateur

`node forms/k-rules-list/gen.mjs <N> [--registry] [--no-soft-delete]` → `forms/k-rules-list/gen/k-rules-list[-registry]-<N>/`
(dans le dossier de la forme, règle du protocole ; marqueurs de `tools/bench.mjs` présents).
Même graphe et densité que `tools/gen.mjs`, plus `softDelete: true` dans chaque `define`. N = 10, 50, 200 (avec et sans registre) : 0 erreur.
Contrôle indicatif unique à 10 : 30 410 instanciations, check 0,30 s (D : 29 708).

## 10. Risques

- **Détection des oublis** : au niveau des types, seule une exigence de couverture (une entrée
  par schéma, `X.rules({})` explicite sinon) détecte l'oubli ; au démarrage, `rules()` mémorise
  chaque déclaration sur le schéma (effet de bord) et l'oubli est signalé avec son fichier et
  sa ligne. Fiable tant que les règles sont dans le module du schéma (toujours évalué avant
  `new App`) ; si elles sont dans un fichier jamais importé, seule la couverture les rattrape.
- La liste `rules` double `schemas` (même longueur, même ordre utile) : redondance pure si la
  couverture est exigée ; variante possible `schemas: [todoRules, …]` (non testée).
- Le message d'oubli (K1) est en tête d'un type intersection long (309 car.) ; `mappedBy` et
  fabrique en double restent des TS2719 illisibles (problème commun au Core du modèle).
- Faute dans une option de forme (`sofDelete`) : cascade de ~29 diagnostics (tout argument
  invalide de `define` fait perdre les champs ; commun à toutes les formes `define`).
- Effet de bord dans `rules()` (registre interne pour K1) : à garder sans état observable.
