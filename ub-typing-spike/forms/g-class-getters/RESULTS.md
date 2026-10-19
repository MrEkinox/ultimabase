# G avec getters (relations à la Zod 4) — différences avec G seulement

Code : copie de `../g-class/` ; `lib/` (cible acceptée telle quelle : `ResolveTarget<T>` rend `T` quand ce
n'est pas un thunk ; exécution qui copie les getters sans les évaluer), `fixture/` (+ `register.ts`),
`fixture-noreg/`, `results-probe.md`, `results-probe-noreg.md`, `runtime-check.mjs`, `isolated/`, `gen.mjs`.

## 1. Forme

```ts
export class Todo extends App.Schema('Todo', {
	title: field.string({ required: true, maxLength: 200 }),
	get assignee() {
		return field.pointer(TodoUser, { onDelete: 'setNull' })
	},
	get parent() {
		return field.pointer(Todo)
	},
	get subtasks() {
		return field.relation(Todo, { mappedBy: 'parent' })
	},
	get tags() {
		return field.relation(Tag)
	},
}, { softDelete: true, postgres: { … } }) { /* corps identique à G */ }

export class TodoRole extends App.RoleSchema('TodoRole', { description: field.string() }, {
	get members() {
		return TodoUser
	},
}) { … }
```

Corps (règles), fabriques, `app.ts`, `ultimabase.ts`, `register.ts`, `usage.ts` : identiques à G.

## 2. Compilation

`./tsc -p forms/g-class-getters/fixture` : **0 erreur** ; `fixture-noreg` : **0 erreur**. Pas de TS7022/TS7023 :
le type de retour d'un getter d'objet littéral, comme celui d'un thunk, n'est lu qu'à la demande.

## 3. Les 8 fautes

Mêmes résultats que G (**7/8 sur la ligne**, `mappedBy` à l'enregistrement), même nombre de diagnostics
et mêmes messages ; seul le cas 1 change de texte d'origine : `field.pointer(TodoUsr, …)` →
`Cannot find name 'TodoUsr'. Did you mean 'TodoUser'?` (52, sur la ligne, 3 diagnostics comme G).
Sans registre : 2 → 391 caractères (G : 391), 4 → 289 (G : 266, ordre des champs), 7 → 243 (G : 249), 6a → 334.

Différences observées :

| Faute | Getters | Thunks (G) |
| --- | --- | --- |
| faute dans un getter qui rend la classe (`get members() { return TodoUsr }`) | **11 diagnostics**, premier : `'TodoRole' is referenced directly or indirectly in its own base expression.` (TS2506), puis TS7023 `'members' implicitly has return type 'any'…`, puis enfin `Cannot find name 'TodoUsr'` | 1 diagnostic : `Cannot find name 'TodoUsr'. Did you mean 'TodoUser'?` |
| getter qui oublie l'appel de champ (`get tags() { return Tag }`) | non détecté sur la ligne ; 2 erreurs ailleurs (`usage.ts` : `…is not assignable to type 'undefined'`) | même risque avec `tags: () => Tag` |

## 4. Infobulles

Identiques à G à quelques caractères près (avec registre : `where` 38, croisé 42, `item` 22,
`this.rules.access(` 80 ; sans : 744, 47, 440, 781). En plus : `get assignee()` →
`(getter) assignee: PointerField<typeof TodoUser, false>` (55).

## 5. Complétion et découvrabilité

Identique à G. Écrire un getter n'est guidé par aucune complétion ; `field.pointer(` propose la cible
attendue sans indiquer qu'elle doit être dans un getter (sans getter : `ReferenceError` à l'import, voir §8).

## 6. `isolatedDeclarations` et JavaScript

`lib/` : 0 diagnostic. Fixture : TS9021 ×12 (G : 14 ; les thunks dans `extends` disparaissent),
TS9012 ×7, TS9010 ×8, TS9019 ×1. JavaScript : non mesuré séparément (même mécanisme d'exécution que G).

## 7. Coûts

Développeur : **+3 lignes par relation** (`todo.ts` 46 lignes contre 38, `todo-user.ts` 21 contre 17,
`todo-role.ts` 12 contre 8, `tag.ts` 14 contre 12), soit ~+20 % sur les fichiers de schéma.
Auteur de plugin : identique pour les règles et options ; **nouvelle obligation pour les fabriques** :
ne jamais lire une option ou un champ fourni par le développeur à la création de la classe (le plugin
Roles déclare `members` possédé comme getter ; Core copie les champs par descripteurs, `mergeFields`).

## 8. Exécution (`node forms/g-class-getters/runtime-check.mjs`)

Même collecte et mêmes 6 rejets que G, plus la résolution paresseuse des cibles après enregistrement :
`Todo targets: assignee -> TodoUser, parent -> Todo, subtasks -> Todo, tags -> Tag`,
`TodoRole.members -> TodoUser`. Avec le runtime de G (copie des champs par décomposition `{ ...fields }`),
la même fixture échoue à l'import : `ReferenceError: Cannot access 'TodoUser' before initialization`
(imports circulaires : le getter est évalué pendant la création de la classe `Todo`).

## 9. Générateur

`node forms/g-class-getters/gen.mjs <N> [--register]` → `gen/g-class-getters-<N>/` ou `g-class-getters-reg-<N>/`
(`get next() { return field.pointer(S1, { onDelete: 'setNull' }) }`, sinon identique à G).
`./tsc -p` : 10 et 50, avec et sans registre : **0 erreur**. Contrôle unique, indicatif : 10 schémas,
40 448 instanciations, check 0,36 s (G : 40 549, 0,36 s).

## 10. Risques

- Aucun gain de typage par rapport aux thunks dans cette forme (G n'a déjà aucun cycle), mais +3 lignes
  par relation.
- Une faute de frappe dans un getter qui rend directement une classe produit un TS2506 trompeur en
  premier diagnostic (11 diagnostics).
- Piège d'exécution : toute copie par décomposition des champs (Core, plugin, outil tiers) évalue les
  getters trop tôt ; invariant à documenter et tester pour chaque auteur de fabrique.
- Verdict : à ne pas retenir pour G ; les thunks `() => X` restent préférables.
