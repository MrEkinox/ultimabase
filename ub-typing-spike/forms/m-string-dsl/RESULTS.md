# M — champs en chaînes typées (micro-test seulement)

Code : `lib/` (89 lignes de Core + copie de `types.ts` avec registre), `fixture/`
(TodoUser, Todo, Tag ; cycles User↔Todo, auto-relation, N-N), `gen.mjs`,
`probe-output.md`, `scratch/` (tentative de validation sur la ligne).

## Forme utilisée

```ts
export const Todo = App.Schema.define({
	className: 'Todo',
	fields: { title: 'string', archived: 'boolean = false', assignee: 'TodoUser?', parent: 'Todo?', subtasks: 'Todo[] by parent', tags: 'Tag[]' },
})
// ultimabase.ts, une fois par application (cibles résolues par nom) :
export const ultimabase = new App({ schemas: [TodoUser, Todo, Tag] })
declare module '../../lib/types.ts' { interface Register { readonly app: typeof ultimabase } }
```

Ajouts nécessaires à la spécification : syntaxe des relations inverses (`'Todo[] by assignee'`,
inventée ici), registre `Register` déclaré une fois (comme C / §9). Ni règles, ni
fabriques, ni options de champ (`hooks: { resolveInput }`, `validate`) : la chaîne n'a
pas de place pour elles sans repasser à un objet.

## Faisabilité

- `./tsc -p forms/m-string-dsl/fixture` : **0 erreur**. `where` croisé
  (`assignee.is.assignedTodos.some`), `include` imbriqué à travers le cycle, 4
  assertions exactes et 1 `@ts-expect-error` effectif (`emial` croisé).
- Analyse des chaînes par gabarits (`${infer T}?`, `${infer N}[] by ${infer M}`) :
  aucun cycle, car les schémas ne s'importent pas ; la cible n'est qu'un nom.
- Piège rencontré : le contrôle d'enregistrement (`mappedBy`) qui résolvait la cible
  **par le registre** donnait TS7022/TS2615/TS2456 sur `ultimabase` ; il faut le
  résoudre dans la liste passée à `new App` (`Extract<TSchemas[number], { className }>`).
- Valider les noms **sur la ligne** (contrainte `fields` lisant `RegisteredNames`) :
  TS7022 sur `TodoUser` et `ultimabase`, TS2456 (`scratch/fixture-registry-check`).
  Même mur que E10 : impossible.

## Qualité des erreurs

| Faute | Où | Diagnostics | Message |
| --- | --- | --- | --- |
| `'TodoUsr?'` (cible) | `ultimabase.ts` (enregistrement), pas la ligne | 3 (dont 2 cascades dans `usage.ts`) | TS2322 `Type 'DefinedSchema<"Todo", Parsed<{ … }>>' is not assignable to …` : 631 caractères tronqués **sans** le texte « unknown schema », aucun « Did you mean » |
| `'strng'` (scalaire) | ligne | 6 (5 cascades dans `usage.ts`) | TS2820 `Type '"strng"' is not assignable to type 'FieldSyntax'. Did you mean '"string"'?` |
| `'Todo[] by asignee'` | enregistrement | 1 | message lisible dans l'élaboration, après le type long |
| registre oublié | aucun diagnostic sur la cause | 3 (assertions) | les cibles deviennent `never` : `where` croisé **non vérifié en silence** (le `@ts-expect-error` sur `emial` devient inutile) |

Hovers : `const Todo` 255 caractères (les chaînes brutes, pas les types) ; résultat
`findMany` 585 (objet résolu).

## Mesure indicative (1 seule exécution, pas un banc)

`node forms/m-string-dsl/gen.mjs 50` puis `./tsc -p … --extendedDiagnostics` (charge
2,5) : 0 erreur, **check 0,31 s, 74 329 instanciations, 51 Mo, 6 749 types**. Le
générateur ne contient que les champs et les `findMany` (M n'a pas de forme de
règles). Référence non équivalente, même graphe sans règles en E1
(`scratch/ref`, avec `.softDelete()` et les emplacements de plugins) : 0,47 s,
81 591 instanciations. Ordre de grandeur comparable ; rien de plus à en tirer.

## Verdict

Faisable pour les champs simples et les requêtes croisées, mais : fautes de cible
vues seulement à l'enregistrement avec un message illisible ; registre obligatoire
dont l'oubli désactive la vérification sans erreur ; aucune place pour les options de
champ ni pour `mappedBy` sans inventer une mini-syntaxe ; même famille de défauts que
C (§4 de `RAPPORT.md`). Non recommandé.
