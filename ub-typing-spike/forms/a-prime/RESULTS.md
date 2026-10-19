# A′ — options de forme dans `define`, règles dans `.with()` (2026-10-09)

Code : `lib/` (copie de `forms/d-hybrid/lib`, méthodes de forme remplacées par des options de
forme), `fixture/`, `tools/probe.mjs`, résultats bruts `probe-results.md`.

## 1. Forme

```ts
export const Todo = App.Schema.define({
	className: 'Todo',
	softDelete: true,
	fields: (field) => ({
		title: field.string({ required: true, validate: (value) => value.trim() !== '' || 'Title is empty' }),
		assignee: field.pointer({ target: () => TodoUser, onDelete: 'setNull' }),
		/* archived, priority (defineEnum), allowedPriorities, status, parent, subtasks, tags */
	}),
}).with({
	access: {
		read: { where: ({ where }) => where.eq('archived', false) },
		update: { where: ({ where, userId }) => where.is('assignee', (user) => user.eq('id', userId)) },
	},
	hooks: { beforeUpdate: ({ item }) => { if (item.isDeleted) throw new TypeError('Deleted todos are read-only') } },
	/* acl, postgres (table + index) */
})
```

Écarts : aucun dans le code de la spécification ; mêmes choix que D (`userId: string`, paquet
`@ultimabase/core`, `Register` dans `ultimabase.ts`). Les fabriques (`PasswordUserSchema`,
`RoleSchema`) n'acceptent **pas** d'options de forme : il faudrait que chaque plugin de fabrique
recopie le mécanisme générique dans sa signature `define` (non fait, voir risques).

Mécanisme Core : `define<const TName, const TFields, const TShape extends ShapeDeclaration<…>>(
declaration: SchemaDeclaration<TName, TFields> & TShape & NoExtraKeys<TShape, …>)`. TypeScript ne
sait pas inférer une *partie* d'un objet : `TShape` reçoit toute la déclaration, puis
`ShapeFieldsOf` ajoute `isDeleted` si `softDelete: true`, et `NoExtraKeys` rétablit le contrôle des
clés inconnues que l'inférence a absorbées.

## 2. Compilation

`./tsc -p forms/a-prime/fixture` : **0 erreur**, aucun TS7022/TS2615/TS2589. Même graphe, mêmes
11 assertions et 8 `@ts-expect-error` que D. Avec ou sans `Register` : 0 erreur.

## 3. Les 8 fautes (avec `Register`)

| # | Faute | Détectée | Sur la ligne | Diag. | Premier message (longueur) |
| --- | --- | --- | --- | --- | --- |
| 1 | `() => TodoUsr` | oui | oui | 3 | `Cannot find name 'TodoUsr'. Did you mean 'TodoUser'?` (52) |
| 2 | `where.eq('archivd')` | oui | oui | 1 | `…parameter of type 'ScalarKeys<"Todo">'.` (89) |
| 3 | `emial` | oui | oui | 1 | `'emial' does not exist in type 'Where<"TodoUser">'. Did you mean to write 'email'?` (136) |
| 4 | `item.isDeletd` | oui | oui | 1 | `…on type 'Readonly<{ acl: ACL; … }>'. Did you mean 'isDeleted'?` (392) |
| 5 | `mappedBy: 'asignee'` | oui | **non** (`ultimabase.ts:9`) | 1 | TS2322 (1 158), texte `mappedBy 'asignee' is not a field of Todo` dans l'élaboration |
| 6 | `acess:` (dans `.with`) | oui | oui | 5 | `'acess' does not exist in type 'PostgresSchemaOption<"Todo"> & …'. Did you mean to write 'access'?` (261) + 4 `any` |
| 7 | `where: () => 42` | oui | oui | 1 | `Type 'number' is not assignable to type 'AccessFilterResult<"Tag">'.` (68) |
| 8 | `select: { titel: true }` | oui | oui | 1 | `'titel' does not exist in type 'Select<DefinedSchema<"Todo", …>>'…` (421) |

**7/8 sur la ligne**, identique à D. Propres à A′ (l'objet de `define` porte maintenant des options) :

| Faute | Diag. | Premier message (sur la ligne) |
| --- | --- | --- |
| `sofDelete: true` | **28** | `'sofDelete' does not exist in type 'SchemaDeclaration<"Todo", { … }> & ShapeDeclaration<…> & NoExtraKeys<…>'. Did you mean to write 'softDelete'?` (443) |
| `softDelete: 'yes'` | **28** | `Type 'string' is not assignable to type 'boolean'.` (50) |
| `softDelete: true, versiond: true` | **28** | `Type 'true' is not assignable to type 'never'.` (46) — pas de « Did you mean » |
| `softDelete` retiré, hook lit `isDeleted` | 10 | `Property 'isDeleted' does not exist on type 'Readonly<{ … }>'` (361) sur la ligne du hook |

Les cascades de 28 viennent du mécanisme d'échec de TypeScript : quand l'argument de l'appel générique
est refusé, il ré-infère sans les fonctions sensibles au contexte, `fields` est ignoré et `Todo`
perd tous ses champs (D a le même défaut pour `className: 42`, 26 diagnostics ; mais D n'a dans
`define` que `className` et `fields`).

## 4. Infobulles

Identiques à D au caractère près (même Core) : `where` **39**, croisé **42**, `item` 390,
`const Todo` 857, `.with(` 892, `findMany` 373 ; sans `Register` : 878 / 910 / 390 / 857 / 1 301 / 373.

## 5. Complétion et découvrabilité

- Dans `define({ className: 'Note', | })` : `fields, softDelete` — les options de forme des plugins
  installés sont proposées (le type générique `TShape` ne casse pas la complétion).
- `.with({ | })` : `access, acl, hooks, postgres` ; après `define({...}).` : `className, createOne, findMany, with`.
- `App.` : `PasswordUserSchema, RoleSchema, Schema, use` (+ membres de `Function`).
- Découvrable : oui, une seule règle à retenir (« tout ce qui n'est pas règle va dans `define` »).

## 6. `isolatedDeclarations` et JavaScript

- `lib/` : 0 erreur. Fixture : 16 × TS9010, 8 × TS9007 (comme D).
- JavaScript : `js-check/tag.js` : `checkJs` 0 erreur, runtime OK (JS identique à D pour un schéma
  sans option de forme).

## 7. Coûts

Auteur de plugin : (a) `access` 22 lignes (identique à D) ; (b) option de forme `softDelete` 7 lignes
(`softDelete: ShapeOption<{ readonly isDeleted: ScalarField<'boolean', boolean, true> }>` + runtime
`shapeOptions`) ; (c) fabrique `RoleSchema` 46 lignes (sans options de forme ; les accepter ajouterait
le paramètre `TShape` et `NoExtraKeys` à chaque fabrique).

Développeur : `todo.ts` 35, total **105** lignes (D : 106). Une notion de moins que D (pas de
chaîne de méthodes de forme), une de plus que N (`.with`).

## 8. Exécution (`node runtime-check.mjs`)

Mêmes collectes que D ; `Todo` : `shape options: softDelete`, champ `isDeleted:boolean`. Refusés au
runtime : 2e rôle, aucun rôle, `sofDelete: true` (`unknown declaration option(s) sofDelete`), règle
`acess`. Filtres croisés évalués : identiques à D.

## 9. Générateur

`node forms/a-prime/gen.mjs <N> [--no-register]` → `forms/a-prime/gen/a-prime-<N>/` (`softDelete: true`
dans `define`, puis `.with({...})`, `Register`). Preuve : 10 et 50 → 0 erreur. Indicatif à 10 (un run) :
31 601 instanciations, check 0,30 s.

## 10. Risques

- Toute erreur au premier niveau de l'objet de `define` (clé d'option de forme, valeur, `className`)
  fait perdre les champs du schéma : ~28 diagnostics dans tous les fichiers qui l'utilisent.
- Le type de forme est inféré depuis tout l'objet (callbacks compris) : mécanisme peu orthodoxe
  (`NoExtraKeys`) ; une clé inconnue à côté d'une option de forme donne `not assignable to type 'never'`.
- Options de forme dans les fabriques : à écrire par chaque plugin de fabrique (ou helper Core à concevoir).
- Mêmes dépendances que D : `.with` final non générique (chemin rapide), `Register` pour les hovers courts.
