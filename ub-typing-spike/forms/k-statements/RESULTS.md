# K′ — instructions de règles sur le schéma, scellé à l'enregistrement

Code : `lib/`, `fixture/`, `runtime-check.mjs`, `cycle-demo/`, `js/`, `gen.mjs`, `tools/`.
Sorties : `results-probe*.md`, `runtime-check-output.txt`.

## 1. Forme

```ts
export const Todo = App.Schema.define({ className: 'Todo', softDelete: true, fields: (field) => ({ … }) })

Todo.access({
	read: { where: ({ where }) => where.eq('archived', false) },
	update: { where: ({ where, userId }) => where.is('assignee', (user) => user.eq('id', userId)) },
})
Todo.acl({ default: () => acl.grantRole('TodoRole', 'read', 'update') })
Todo.hooks({ beforeUpdate: ({ item }) => { if (item.isDeleted) throw new TypeError('Deleted todos are read-only') } })
Todo.postgres({ table: 'todos', indexes: [{ fields: ['status', 'dueAt'] }] })
// ultimabase.ts
export const ultimabase = new App({ schemas: [TodoUser, TodoRole, Todo, Tag] })   // scelle les schémas
```

Écarts : aucun. Ajouts : `acl`/`postgres` (fixture) ; `userId: string`. Core :
`RuleStatements<TApp, TSchema>` = type mappé **homomorphe** sur
`SchemaRulesFor<HKTs, never>` (clés indépendantes du schéma, JSDoc des plugins conservée),
dont seuls les paramètres lisent le schéma : une méthode `(rules) => void` par entrée de
plugin. Les instructions ne sont dans le type d'aucune déclaration : aucun cycle possible.

## 2. Verdict de compilation

Fixture : **0 erreur** ; avec registre (`Register { app: typeof ultimabase }`) : 0 erreur.
Aucun TS7022/TS2615/TS2589. Générés 10/50/200, avec et sans registre : 0 erreur.

## 3. Les 8 fautes (`results-probe.md`)

| # | Faute | Détectée | Sur la ligne | Diag. | Premier message (longueur sans / avec registre) |
| --- | --- | --- | --- | --- | --- |
| 1 | `() => TodoUsr` | oui | oui | 2 | `Cannot find name 'TodoUsr'. Did you mean 'TodoUser'?` (52) |
| 2 | `where.eq('archivd', …)` | oui | oui | 1 | `ScalarKeys<DefinedSchema<"Todo", {…}>>` (385) / `ScalarKeys<"Todo">` (89) |
| 3 | `emial` | oui | oui | 1 | `…in type 'Where<Schema<"TodoUser", …>>'. Did you mean to write 'email'?` (439) / `Where<"TodoUser">` (136) |
| 4 | `item.isDeletd` | oui | oui | 1 | `…on type 'Readonly<{ acl: ACL; … }>'. Did you mean 'isDeleted'?` (268) |
| 5 | `mappedBy: 'asignee'` | oui | **non** (`ultimabase.ts:7`) | 1 | TS2322 `Type 'Schema<"TodoUser", …' is not assignable to type 'DefinedSchema<…> & SchemaRegistrationError<…>'` (677 / 1 158) |
| 6 | `Todo.acess({` | oui | oui | 5 | TS2551 `Property 'acess' does not exist on type 'Schema<"Todo", …>'. Did you mean 'access'?` (370, **inchangé avec registre** : c'est le type de la constante) ; + 4 `any` implicites |
| 7 | `where: () => 42` | oui | oui | 1 | `AccessFilterResult<DefinedSchema<"Tag", …>>` (363) / `AccessFilterResult<"Tag">` (68) |
| 8 | `select: { titel: true }` | oui | oui | 2 | `'titel' does not exist in type 'Select<Schema<"Todo", …>>'. Did you mean to write 'title'?` (431) |

**8/8 détectées, 7/8 sur la ligne** (`mappedBy` à l'enregistrement). Faute à côté de clés
valides dans `select` (8b) : non signalée sur la ligne, comme dans toutes les formes.

Cas propres à K′ :

| Cas | Types | Exécution |
| --- | --- | --- |
| K′1 même instruction deux fois (`Todo.hooks` ×2) | **0 diagnostic** | `TypeError: Note.access(...) at runtime-check.mjs:50: already declared at runtime-check.mjs:49` |
| K′2 clé fausse dans une instruction (`red:`) | ligne, 2 diag. (`AccessOptions<"Todo">` avec registre, 137) | — |
| K′3 deuxième `RoleSchema` | `schemas`, 2 diag. (long) | `exactly one registered schema expected, got 2` |
| K′4 `sofDelete: true` | ligne, 29 diag. (cascade, commune aux formes `define`) | `unknown schema option 'sofDelete'` |
| K′6 instruction déplacée dans une fonction appelée plus tard | **0 diagnostic** | `TypeError: Todo.acl(...) at runtime-check.mjs:46: Todo is sealed (registered by new App); declare rules before registration` |

## 4. Infobulles (sans / avec registre)

| Point | Sans | Avec |
| --- | --- | --- |
| `where` | 903 | **39** `WhereBuilder<"Todo">` |
| cible croisée `(user) =>` | 781 | **42** |
| cible à deux sauts (Tag) | 904 | **38** |
| hook `item` | 414 | 414 |
| `const Todo` | 884 | 884 |
| `Todo.access(` | 834 | **57** `(property) access: (rules: AccessOptions<"Todo">) => void` + JSDoc du plugin |
| `Todo.hooks(` | 832 | **55** |
| `const ultimabase` | 830 | 830 |
| résultat `findMany` | 364 | 364 |

## 5. Complétion et découvrabilité

- `StaffRole.` : `access, acl, addMember, className, createOne, findMany, hooks, postgres` —
  **les méthodes des plugins installés** sont listées directement sur le schéma, avec la JSDoc
  du plugin (`Row and operation access rules.`, `@example`). La meilleure découvrabilité des trois.
- `StaffRole.access({|})` : `create, delete, read, update`.
- `App.` : `PasswordUserSchema, RoleSchema, Schema, use` ; `App.Schema.define({|` : `softDelete`.
- Les noms de règles partagent l'espace de noms du schéma (requêtes Core, méthodes de modèle
  des fabriques) : collision possible (`createOne`, `signUp`…) à refuser dans `use()`.

## 6. `isolatedDeclarations` et JavaScript

- `lib/` : 0 diagnostic. Fixture : 14 × TS9010 + 8 × TS9007 (constantes de schéma, thunks) ;
  les instructions ne sont pas des déclarations exportées : **rien à annoter pour les règles**.
- JavaScript (`js/todo-role.js`) : s'exécute (règle `access` collectée) ; `checkJs` 0 erreur ;
  `idd`, `acess` (`Property 'acess' does not exist…`) et `TodoUsr` signalés sur la ligne.

## 7. Coûts

Auteur de plugin : identique à K (entrée `access` 8 lignes, `softDelete` 16, `RoleSchema` 41) ;
le Core transforme chaque clé d'entrée en méthode, le plugin n'écrit aucune méthode.

Développeur : 95 lignes non vides (todo 36, todo-user 15, tag 13, todo-role 11, app 12,
ultimabase 6) — la plus courte. Concepts : `define`, options de forme, une méthode par plugin,
scellement. `Todo` écrit 16 fois (préfixe de chaque instruction), aucune constante de règles,
aucune liste ; rien par application en plus de `schemas`.

## 8. Exécution (`node runtime-check.mjs`)

Mêmes données collectées que K (champs, options de forme, règles par plugin, filtres et hook
exécutés). Comportement propre à K′ :

```text
Tag rules after registration: access (tag-extra-rules.ts never imported: its hooks are silently absent)
K'a TypeError: Todo.acl(...) at runtime-check.mjs:46: Todo is sealed (registered by new App); …
K'b (import tardif d'un module de règles) TypeError: Tag.hooks(...) at tag-extra-rules.ts:6: Tag is sealed …
K'c TypeError: Note.access(...) at runtime-check.mjs:50: already declared at runtime-check.mjs:49
K'd TypeError: Note.acess is not a function
K'e schéma enregistré dans une seconde application (tests) : accepté (règles déjà scellées)
```

Ordre d'évaluation ESM (`cycle-demo/`, module de schéma qui importe l'instance d'application) :
entrée qui importe d'abord le schéma → `ReferenceError: Cannot access 'Note' before initialization`
(bruyant, 0 diagnostic TypeScript) ; entrée qui importe d'abord l'application → `Note rules=hooks`.
Une instruction **dans le module du schéma** ne peut pas être perdue : ce module est
entièrement évalué avant tout module qui l'importe (dont celui qui appelle `new App`), sauf
cycle, qui donne une erreur TDZ et non une perte. Elle n'est perdue **silencieusement** que
si elle est dans un autre module jamais importé (indétectable : rien ne la référence).

## 9. Générateur

`node forms/k-statements/gen.mjs <N> [--registry] [--no-soft-delete]` → `forms/k-statements/gen/…`.
Quatre instructions par schéma (`access`, `hooks`, `acl`, `postgres`). N = 10, 50, 200 : 0 erreur.
Indicatif à 10 : 31 386 instanciations, check 0,31 s.

## 10. Risques

- **Mutabilité** : le schéma accumule des règles jusqu'à `new App` ; contredit « Immutable models
  and builders » (AGENTS.md) entre la définition et l'enregistrement. Scellement obligatoire.
- Aucun contrôle de type pour : instruction en double, instruction après enregistrement,
  règles dans un module non importé. Tout repose sur l'exécution (messages clairs, avec fichier
  et ligne, mais au démarrage ou plus tard).
- Ordre d'importation : une instruction exécutée hors du module du schéma dépend de l'ordre
  d'évaluation (import tardif → exception) ; tests qui ajoutent des règles impossibles après le
  premier enregistrement.
- Espace de noms partagé entre méthodes de plugins, requêtes Core et modèles de fabriques.
- `Todo.acess(` reste long (370 car.) même avec registre : erreur portée par le type de la constante.
