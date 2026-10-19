# D + relations par getter (à la Zod 4) — différences avec D (2026-10-09)

Même Core, mêmes plugins, même fixture que `forms/d-hybrid` (copie), sauf les relations :
seules les **différences** sont rapportées ; le reste de `../d-hybrid/RESULTS.md` vaut tel quel
(complétion, coûts plugin, runtime, 8 fautes hors 1 et 5 : mêmes messages, mêmes longueurs).

## 1. Forme

```ts
export const Todo = App.Schema.define({
	className: 'Todo',
	fields: (field) => ({
		title: field.string({ required: true }),
		archived: field.boolean({ required: true, default: false }),
		get assignee() {
			return field.pointer({ target: TodoUser, onDelete: 'setNull' })
		},
		get parent() {
			return field.pointer({ target: Todo })
		},
		/* subtasks, tags : getters aussi */
	}),
})
	.softDelete()
	.with({ /* identique à D */ })
```

Changements Core (2 lignes de type) : `ResolveTarget<T> = T extends () => infer S ? S : T` (le
schéma lui-même ou un thunk, gardé pour `members: () => TodoUser` de la fabrique de rôles) ;
le runtime résout `target` directement ou en appelant le thunk. Aucun changement de plugin.

## 2. Compilation et cycles

`./tsc -p forms/d-hybrid-getters/fixture` : **0 erreur** (cycles Todo↔TodoUser, auto-relation
`parent`/`subtasks`, N-N Todo↔Tag, filtres croisés dans les deux sens). Les getters suffisent :
TypeScript ne type le getter que lorsqu'on lit le champ, jamais pendant le typage de la constante.

Le getter n'est nécessaire **que pour fermer un cycle**, et son oubli est silencieux ou lointain :

| Oubli | Résultat |
| --- | --- |
| `tags: field.relation({ target: Tag })` sans getter (Tag pointe vers Todo par getter) | 0 erreur (aucun cycle fermé) |
| `target: () => Todo` mélangé aux getters | 0 erreur (les deux formes acceptées) |
| `assignee` **et** `assignedTodos` sans getter (cycle fermé) | **26 diagnostics**, premier : `'TodoUser' implicitly has type 'any' because it … is referenced directly or indirectly in its own initializer.` (TS7022, `todo-user.ts:4`, pas sur la ligne oubliée) + TS7023 sur `fields` |
| `parent: field.pointer({ target: Todo })` sans getter (auto-relation) | **21 diagnostics**, TS7022 sur `Todo` (ligne 7) |
| getter sans `return` | `A 'get' accessor must return a value.` (TS2378, 37) sur la ligne du `get` |

## 3. Fautes 1 et 5

| # | Faute | Détectée | Sur la ligne | Diag. | Premier message (longueur) |
| --- | --- | --- | --- | --- | --- |
| 1 | `target: TodoUsr` dans le getter | oui | oui | 3 | `Cannot find name 'TodoUsr'. Did you mean 'TodoUser'?` (52) — identique à D |
| 5 | `mappedBy: 'asignee'` | oui | non (`ultimabase.ts:9`) | 1 | TS2322 (1 158), `RelationField<DefinedSchema<"Todo", …>, "asignee">` au lieu de `RelationField<() => DefinedSchema<…>>` — identique sur le fond |

Les 6 autres fautes : mêmes résultats que D (7/8 sur la ligne).

## 4. Infobulles (différences)

| Point | D (thunk) | Getters |
| --- | --- | --- |
| `where`, croisé (avec `Register`) | 39 / 42 | 39 / 42 |
| `where`, croisé (sans `Register`) | 878 / 910 | 872 / 904 (`PointerField<ConfiguredSchema<…>>` au lieu de `PointerField<() => …>`) |
| `const Todo` | 857 | 851 |
| `.with(` avec / sans `Register` | 892 / 1 301 | 892 / 1 295 |
| getter `assignee` | — | 912 (`(getter) assignee: PointerField<ConfiguredSchema<"TodoUser", { … }>>`) |

## 5. `isolatedDeclarations` et JavaScript

- `lib/` : 0 erreur.
- Fixture : 16 × TS9010, **6 × TS9009** (`At least one accessor must have an explicit type annotation`,
  un par getter) au lieu de 8 × TS9007 (thunks) ; restent 2 × TS9007 (`members: () => TodoUser`
  des deux schémas de rôles). Annoter un getter demande d'écrire `PointerField<typeof TodoUser, false>` : faisable
  pour un champ, mais pas pour la constante de schéma (TS9010 reste).
- JavaScript : `js-check/tag.js` (getter) : `checkJs` 0 erreur, runtime OK.

## 6. Coût développeur

Lignes non vides : `todo.ts` 44 (D : 36), `todo-user.ts` 20 (18), `tag.ts` 15 (13) ; total **118**
(D : 106). Chaque relation coûte 3 lignes au lieu d'une ; une notion de plus (getter + `return`).

## 7. Générateur

`node forms/d-hybrid-getters/gen.mjs <N> [--no-register]` → `gen/d-hybrid-getters-<N>/` : chaque
`next`/`prevs`/`parent` est un getter. Preuve : 10 et 50 → 0 erreur. Indicatif à 10 (un seul run) :
31 533 instanciations, check 0,31 s (D : 31 295 / 0,30 s).

## 8. Risques

- Oublier un getter sur une relation qui ferme un cycle donne TS7022 sur la constante (pas sur le
  champ), avec 20+ diagnostics ; l'oublier ailleurs ne dit rien, donc la règle « relation = getter »
  n'est pas imposée par l'outil (un lint serait nécessaire).
- Deux écritures acceptées pour la même chose (getter et thunk) si l'on garde `() => X` pour les
  options de fabrique.
- Plus verbeux (+11 % de lignes) sans gain de diagnostic ni d'infobulle mesurable par rapport à D.
