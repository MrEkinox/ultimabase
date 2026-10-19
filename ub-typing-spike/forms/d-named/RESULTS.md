# D nommé : modèles, résultats et utilitaires imprimés par nom (2026-10-09)

Copie de `forms/d-hybrid`. Code développeur **inchangé** (même ligne `Register`). Ajouts au fixture, identiques
avant/après : `src/named.ts` (requêtes sans `select`, `findOne`, utilitaires, 7 assertions) et un hook `afterSave: ({ originalItem }) => …`.
« Avant » = `baseline/` (lib de d-hybrid + `findOne` structurel + `Model`/`UpdateInput` naïfs). Sondes : `probe-ts6.md`,
`baseline/probe-ts6.md`, `results/probe-*-ts{6,7}.json`, `results/compare-*.md` (TS6 : `tools/probe.mjs` ; TS7 : `ts7/tools/probe-both.mjs`).

## 1. Forme côté Core (extrait, plugins inchangés sauf `signUp`)

```ts
// types.ts — alias internes indexés par référence (nom enregistré ou schéma)
export type Model<TRef> = { readonly [K in ModelKeys<FieldsOf<TRef>>]: FieldOutput<FieldsOf<TRef>[K], undefined> }
export type CreateInput<TRef> = CreateFields<FieldsOf<TRef>>
export type UpdateInput<TRef> = UpdateFields<FieldsOf<TRef>>
export type Item<TRef> = TRef extends string ? Model<TRef> : Readonly<Writable<Result<TRef, {}>>>   // hooks
// core.ts — utilitaires publics : acceptent `typeof Todo` ou 'Todo', normalisent vers le nom ;
// ils masquent l'`export type *` (export local prioritaire) et la branche résolue imprime l'alias interne.
export type Model<TSchema> = SchemaRef<TSchema> extends infer TRef extends string ? NamedModel<TRef> : Item<TSchema>
export type CreateInput<TSchema> = SchemaRef<TSchema> extends infer TRef extends string ? NamedCreateInput<TRef> : NamedCreateInput<TSchema>
export type QueryResult<TSchema, TArgs> = TArgs extends { readonly select: unknown } | { readonly include: unknown }
	? Simplify<Result<TSchema, TArgs>> : Model<TSchema>
findMany<TSelf, const TArgs extends FindManyArgs<TSelf> = {}>(this: TSelf, args?: TArgs, …): Promise<QueryResult<TSelf, TArgs>[]>
findOne<TSelf, const TArgs extends FindOneArgs<TSelf>>(this: TSelf, args: TArgs, …): Promise<QueryResult<TSelf, TArgs> | null>
createOne<TSelf, const TArgs extends CreateArgs<TSelf>>(this: TSelf, args: TArgs, …): Promise<QueryResult<TSelf, TArgs>>
```

Deux alias car un alias imprime ses arguments **tels qu'écrits** (`Model<typeof Todo>` direct → `Model<DefinedSchema<"Todo", {…}>>`) ;
le conditionnel public se résout en l'instance `Model<"Todo">` de l'alias interne (même identité que l'`item` des hooks).
Variante **`named-args`** (`experiments/named-args/`) : en plus `FindManyArgs<SchemaRef<TSelf>>` (idem `findOne`/`createOne`).

## 2. Compilation et non-régression

- `./tsc -p forms/d-named/fixture` : **0 erreur**, aucun TS7022/TS2615/TS2589 ; 11 + 7 assertions exactes (dont
  `Equal<(typeof allTodos)[number], Model<typeof Todo>>`), 8 `@ts-expect-error` effectifs. Sans `Register`, `named-args` : 0 erreur (TS6, TS7).
- `lib/` `--isolatedDeclarations` : 0 erreur ; fixture contre les `.d.ts` émis (`isolated/dts-fixture`) : **infobulles et 24 cas identiques**.
- Complétion `item.` (TS6 = TS7) : `acl, allowedPriorities, archived, assignee, createdAt, id, isDeleted,
  parent, priority, status, title, updatedAt` (12, comme avant) ; `item.isDeletd` → `Did you mean 'isDeleted'?`.
  Runtime : `node forms/d-hybrid/runtime-check.mjs forms/d-named/fixture/src/ultimabase.ts` : même collecte, code 0.

## 3. Infobulles avant / après (longueur en caractères ; TS6 / TS7)

| Point | Avant TS6 / TS7 | Après TS6 / TS7 | Texte après (TS6 = TS7 sauf mention) |
| --- | --- | --- | --- |
| `item` (hook) | 390 / 390* | **31 / 31** | `item: Model<"Todo">` |
| `originalItem` | 405 / 405* | **46 / 46** | `originalItem: Model<"Todo"> \| null` |
| `findMany()` / `findMany({ where, limit })` | 488 / 489 (*) | **31 / 32** | `const allTodos: Model<"Todo">[]` |
| `findOne({ where })` | 492 / 492* | **35 / 35** | `Model<"Todo"> \| null` |
| `createOne({ data })` | 486 / 486* | **29 / 29** | `Model<"Todo">` |
| partiels : `findOne`+`select` / `findMany`+`include` / `pending` (select+include) | 79 / 725 (TS7 718*) / 373* | identiques | structurel, inchangé |
| `Model<typeof Todo>` | 385 / 385* (alias naïf) | **26 / 26** | `const model: Model<"Todo">` |
| `CreateInput<typeof Todo>` / `UpdateInput<…>` | 877 / 877* | **38 / 38** | `CreateInput<"Todo">` / `UpdateInput<"Todo">` |
| `where` / croisé / rôle | 39 / 42 / 43 | 39 / 42 / 43 | inchangé |
| `const Todo` / `const TodoUser` / `.with(` | 857 / 894 / 892 (TS7 898) | identiques | inchangé (§5) |

`*` texte réordonné par TS7. **Toutes les infobulles nommées : texte identique TS6/TS7.** Sans `Register` (repli structurel,
mêmes longueurs TS6/TS7, rien ne signale la perte) : `item` 390, `findMany()` 390, `findOne` 394, `Model<typeof Todo>` 385, `CreateInput` 877.

## 4. Les 8 fautes (TS6 ; TS7 : mêmes diagnostics, fichier/ligne/colonne/code)

| # | Faute | Sur la ligne | Diag. | Premier message après (longueur) | Avant |
| --- | --- | --- | --- | --- | --- |
| 1 | `() => TodoUsr` | oui | 3 | `Cannot find name 'TodoUsr'. Did you mean 'TodoUser'?` (52) | identique |
| 2 | `where.eq('archivd')` | oui | 1 | `Argument of type '"archivd"' is not assignable to parameter of type 'ScalarKeys<"Todo">'.` (89) | identique |
| 3 | `emial` (Todo→TodoUser) | oui | 1 | `…'emial' does not exist in type 'Where<"TodoUser">'. Did you mean to write 'email'?` (136) | identique |
| 4 | `item.isDeletd` | oui | 1 | **`Property 'isDeletd' does not exist on type 'Model<"Todo">'. Did you mean 'isDeleted'?` (85)** | 392 (TS7 291, réordonné) |
| 5 | `mappedBy: 'asignee'` | non (`ultimabase.ts:9`) | 1 | TS2322 long à l'enregistrement (1 158 ; TS7 1 612) | identique |
| 6 | `acess:` | oui | 5 | `'acess' does not exist in type 'PostgresSchemaOption<"Todo"> & AccessSchemaOption<"Todo"> & …'. Did you mean to write 'access'?` (261) | identique |
| 7 | `where: () => 42` | oui | 1 | `Type 'number' is not assignable to type 'AccessFilterResult<"Tag">'.` (68) | identique |
| 8 | `select: { titel: true }` | oui | 1 | `'titel' does not exist in type 'Select<DefinedSchema<"Todo", { … }>>'` (421 ; TS7 424) | identique ; **`named-args` : `…'titel' does not exist in type 'Select<"Todo">'. Did you mean to write 'title'?` (133)** |

7/8 sur la ligne, 8/8 détectées, comme d-hybrid. `allTodos[0]?.titel`, `model.titel` → `…on type 'Model<"Todo">'. Did you mean 'title'?`
(78 ; avant 253 / 385). Cascades des cas fragiles connus : `.softDelete()` deux fois 17 → 19, méthode de forme après
`.with` 26 → 29 (`named-args` 32), les résultats nommés dépendant du registre cassé ; autres cas : mêmes nombres.

## 5. Constante de schéma : ce qui reste impossible (2 idées, arrêt)

- **Idée A, vue « classe »** (`experiments/idea-a/`) : `.with` renvoie le côté statique d'une classe
  déclarée dans une fonction générique de Core (`ReturnType<typeof configuredSchemaClass<TName, TFields, TApp>>`).
  Depuis les sources : 0 erreur, `const Todo: typeof Schema` (**25**), `.with(` 483, cas 8 `Select<typeof Schema>` (140).
  Mais (1) **tous** les schémas s'impriment `typeof Schema` (nom perdu ; sans `Register`,
  `CreateInput<typeof Schema>` pour chacun, messages ambigus) ; (2) les fabriques gardent l'alias (`TodoUser` 509) ;
  (3) **TS9007** sous `isolatedDeclarations`, et l'émission `.d.ts` remplace la classe par un littéral :
  depuis le paquet construit, `const Todo` = **869** (pire qu'avant). Échec.
- **Idée B, vue opaque `NamedSchema<"Todo">`** dont `'~fields'` = `FieldsOf<"Todo">` lu dans le registre
  (`experiments/idea-b/`) : le registre (`typeof ultimabase` → schémas → cette vue) se référence lui-même :
  19 erreurs, **TS7022** (`ultimabase`), TS2502, TS2456 ×3 (`RegisteredList`, `RegisteredNames`, `SchemaNamed`),
  `where: WhereBuilder<any>`, `item: any` (hover `const Todo: NamedSchema<"Todo">` 31, mais vide). Échec par construction.
- Raison (confirme RAPPORT §9) : les champs n'existent que dans le type de la constante ; un nom court devrait les
  retrouver ailleurs, et le seul « ailleurs » est le registre, qui pointe vers cette constante.

## 6. Performance (même session, séquentiel, 3 exécutions, médianes)

`node forms/d-named/tools/campaign.mjs` (méthode de BENCH.md + TS7.md : `tools/bench.mjs`,
`bench-rule.mjs`, `tsc --extendedDiagnostics` sous `/usr/bin/time -l`, TS7 `tsc` et `ts7/tools/lsp-bench.mjs`) ;
même code généré, seul le Core lié change (`hybrid` = copie conforme de `forms/d-hybrid/lib`). Charge
1 min 2,3–3,7 ; aucun écart > 15 % entre exécutions ; 0 erreur partout (TS6/TS7), hover `q0` 190, 1 diag.
après édition. d-hybrid retrouve BENCH.md (check 1,58 = 1,58 ; éd. 0,75 = 0,75). Brut : `results/campaign.jsonl`, `results/summary.md`.

| N | Variante | Froid | Éd.→diag | Éd.→tout | Schéma+hover | Règle | Tas | tsc6 check | Inst. TS6 | TS7 check (1 fil) | TS7 éd.→diag | TS7 règle |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | d-hybrid / d-named | 0,47 / 0,48 | 0,08 / 0,08 | 0,13 / 0,13 | 0,09 / 0,10 | 0,10 / 0,10 | 135 / 119 | 0,30 / 0,30 | 31 295 / 31 223 | 0,03 / 0,03 | 0,02 / 0,02 | 0,01 / 0,01 |
| 50 | d-hybrid / d-named | 0,83 / 0,82 | 0,22 / 0,22 | 0,41 / 0,40 | 0,22 / 0,22 | 0,18 / 0,18 | 168 / 178 | 0,64 / 0,62 | 123 951 / 121 719 | 0,08 / 0,08 | 0,06 / 0,06 | 0,03 / 0,03 |
| 200 | d-hybrid | 1,88 | 0,75 | 1,46 | 0,71 | 0,46 | 369 | 1,58 | 471 411 | 0,32 (0,45) | 0,23 | 0,09 |
| 200 | **d-named** | 1,86 | 0,76 | 1,44 | 0,70 | 0,44 | **429** | 1,59 | 461 079 | 0,32 (0,44) | 0,23 | 0,10 |
| 200 | d-named-args | 1,82 | 0,71 | 1,37 | 0,68 | 0,46 | 397 | 1,53 | 430 830 | 0,30 (0,42) | 0,21 | 0,11 |
| 200 | d-hybrid-noreg / d-named-noreg | 1,71 / 1,71 | 0,62 / 0,63 | 1,41 / 1,40 | 0,60 / 0,60 | 0,10 / 0,10 | 301 / 330 | 1,42 / 1,45 | 455 457 / 459 122 | 0,27 / 0,28 | 0,19 / 0,18 | 0,01 / 0,01 |

**Temps identiques à d-hybrid à ±3 %** (bruit), TS6 et TS7 ; instanciations −2 % (`named-args` −9 %, cause non analysée).
Seul coût : tas du service de langage à 200 +60 Mio (422/429/429 contre 368/369/369) ; RSS `tsc` inchangé (363/371 Mio TS6,
158/160 TS7). `named-args` : tas +28 Mio, éd. 0,71, check 1,53, et cas 8 → `Select<"Todo">` (133, identique TS6/TS7).

## 7. Risques

- Deux alias `Model` (interne, public) : le texte dépend du nom de l'alias interne, imprimé même non importable
  (TS6, TS7, `.d.ts`) ; à protéger par un test d'éditeur.
- `Model<'Tod'>` (nom inconnu) n'est pas une erreur : type vide, erreur seulement à l'usage (`…on type 'Model<"Tod">'`) ;
  une contrainte `extends RegisteredNames` casserait l'usage sans `Register`.
- Tout dépend du `Register` (repli structurel silencieux) ; deux schémas de même `className` partageraient `Model<"X">`.
- Les résultats complets lisent le registre à chaque requête : cascades plus longues si le registre est cassé ;
  invariant inchangé (aucun type de constante de schéma ne le lit). `const Todo`, `.with(`, `mappedBy` restent longs.
