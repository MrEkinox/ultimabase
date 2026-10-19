# D en classe : nom court pour la constante de schéma (2026-10-09)

Base : `d-named/experiments/named-args` (meilleure D : cas 8 `Select<"Todo">`, check le plus bas). Répertoires neufs :
`forms/d-class-wrapper`, `forms/d-class-body`, `forms/d-build` (`fixture/` = `.build()`, `with-class/` = idée A refaite).
Fixture cyclique complète de d-named + `Register` ; sondes `d-class-body/tools/probe.mjs`, `ts7/tools/probe-both.mjs`.

## 1. `d-class-wrapper` : `class Todo extends App.Schema.define({...}).softDelete().with({...}) {}` — échec
Core : `.with` renvoie `DefinedSchema & TModel & SchemaConstructor` (signature `new () => SchemaInstance` vide), le
runtime renvoie une vraie classe ; contrôle des membres comme E1. `./tsc -p forms/d-class-wrapper/fixture` : **39 erreurs**
(TS6 ; TS7 36), dont `TS2506 'TodoUser' is referenced directly or indirectly in its own base expression`, TS7022
(`TodoUser`, `ultimabase`), TS2502, TS2456 ×3, 13 TS7031. Cause (TS 6.0.3, `getBaseConstructorTypeOfClass`) : la clause
`extends` est typée par `checkExpression` complet, **sans le chemin rapide** `getQuickTypeOfExpression` que
`checkDeclarationInitializer` applique à une `const` : les callbacks de `.with` sont vérifiés pendant la résolution de
la base. Bornes (`scratch/`) : registre + filtres locaux seuls → 34 erreurs (TS2506) ; sans registre + croisés → TS2506
`Todo`/`TodoUser`, TS2615, TS7023 ×5 ; sans registre, croisés dans un seul sens → 20 erreurs (TS2506 `Tag`) ; sans
registre ni croisé → 0 erreur, `class Todo`. Le stub d'exécution marche (`runtime-check.mjs`). **Verdict : bloquant**
(cause dans le vérificateur, pas dans la signature de `.with` ; pas de troisième essai).

## 2. `d-class-body` : `class Todo extends App.Schema.define({...}).softDelete() { static rules = this.with({...}) }` — viable
Code : `export class Todo extends App.Schema.define({ className: 'Todo', fields }).softDelete() { static rules =
this.with({ access, acl, hooks, postgres }); static findOpen() { return this.findMany({ where: … }) } }` (fabriques idem).
Core : `define`/formes renvoient un type constructible ; `with<TSelf>(this: TSelf, rules: SchemaOptionsFor<…, SchemaRef<TSelf>>):
SchemaRules<TSelf>` (E2) ; runtime : classes, jeton de règles gelé en `WeakMap`. Deux corrections trouvées par bissection
(`scratch/`) : (a) l'identité `<X>() => X extends A…` du contrôle des redéfinitions lisait les statiques → TS7022 sur
`rules` ; remplacée par `[Framework[K]] extends [Class[K]]` ; (b) **TS 7.0.2 seul** : `TSchema extends { '~framework'?:
infer F }` → TS7022 sur `Tag.rules` (TS6 : 0 dans tous les ordres, `specs/order.mjs`) ; accès indexé : 0 partout.

- Compilation : **0 erreur** (TS6 et TS7, avec et sans `Register`), 8 assertions `named.ts` (dont `N8` : `Todo.findOpen()`
  = `Model<typeof Todo>[]`), 11 `usage.ts`, 8 `@ts-expect-error` effectifs ; aucun TS2506/TS7022/TS2615/TS2589.
- Aides statiques : typées (`(method) Todo.findOpen(): Promise<Model<"Todo">[]>`, 50), sans cycle, proposées sur `Todo.`.
- Enregistrement (types) : méthode/champ d'instance → `Todo: instance member 'isLate' is not allowed; …` (TS2375, 485,
  sur `new App`) ; `static override findMany()` → `static 'findMany' overrides a framework member` (+19 en cascade) ;
  sans `override` → TS4114 sur la ligne. **Avec `Register`, la provenance de `rules` n'est pas vérifiable par les types**
  (lire son type depuis le registre → TS7022, `scratch/k`) : `static rule = this.with(…)` **compile en silence** ;
  seul le runtime refuse (règles empruntées, mal nommées, objet simple).
- Exécution (`node forms/d-class-body/runtime-check.mjs`) : même collecte que D ; refus : 2e rôle, aucun rôle, `acess`,
  méthode/champ d'instance, redéfinition, règles d'une autre classe, sous un autre nom, objet simple ; aide acceptée.
- JavaScript (`js-check/tag.js`, `checkJs`) : 0 erreur, `class Tag` (9), `WhereBuilder<"Tag">` (38), fautes sur la
  ligne, enregistrée au runtime.
- `isolatedDeclarations` : `lib/` 0 ; fixture : TS9021 ×12 (`extends` à expression, non annotable), TS9012 ×5 (`rules`),
  TS9010 ×20, TS9008/TS9007 ×1, TS2883 ×8 (alias interne `Model`, déjà ×6 dans d-named-args). `.d.ts` émis : `declare
  const Tag_base: Schema<…>; export declare class Tag extends Tag_base { static rules: SchemaRules<typeof Tag> }` : le
  nom survit (`app-dts/`) ; `todo.d.ts` bloqué par TS2883 sur `findOpen` (annoter ou exporter l'alias interne).

## 3. `d-build` — échec
- `.with({...}).build()` : **39 erreurs** (TS7022 `TodoUser`, `ultimabase`) ; sans registre 46 (TS7022 `Todo`/`TodoUser`,
  TS2615) ; TS7 idem : `.with` n'est plus le dernier appel (RAPPORT §10).
- `.with` qui renvoie la classe (`with-class/`) : 0 erreur ; `const Todo: typeof Schema` (25, usage 45) : nom perdu ;
  contre le Core émis : **869** ; `.d.ts` de l'application : `export declare const Tag: (abstract new () => {}) & {
  readonly className: "Tag"; … }` (3,6 Ko). **Verdict : échec** (cycle, ou nom perdu).

## 4. Infobulles (caractères ; TS6 / TS7 ; `d-class-body` = texte identique TS6/TS7 sauf mention)
| Point | d-named-args (const) | d-class-body + `Register` | d-class-body sans `Register` (`noreg-model`) | `with-class` source / Core `.d.ts` |
| --- | --- | --- | --- | --- |
| constante, déclaration | 857 / 857 | **10 / 10** `class Todo` | **10** | 25 `typeof Schema` / 869 |
| constante, usage `Todo.findMany` | 877 / 865 | **30 / 18** `(alias) class Todo` | 30 / 18 | 45 (TS7 33) / 889 |
| fabrique `TodoUser` | 894 | **14** `class TodoUser` | 14 | 509 / 906 |
| `where` / croisé | 39 / 42 | 39 / 42 `WhereBuilder<"Todo">` | 44 / 47 `WhereBuilder<typeof Todo>` | 39 / 42 |
| `item` (hook) | 31 | 31 `Model<"Todo">` | 36 `Model<typeof Todo>` | 31 |
| `findMany()` / `findOne({ where })` | 31 / 35 | 31 / 35 | 36 / 40 | 31 / 35 |
| `findOne` + `select` (partiel) | 79 | 79 | 79 | 79 |
| `CreateInput<typeof Todo>` | 38 | 38 | 43 | 38 |
| entrée des règles | `.with(` 892 / 898 | `this.with(` 483 / 483 | 503 | 483 |
| méthode `Todo.findMany(<args>)` | 989 | 2 136 / 1 431 (le littéral `TArgs` occupe la place) | idem | 2 377 / 1 672 |

TS7 : `(alias) class Todo` sans la ligne `import Todo` ; autres écarts = ordre stable. Sans `Register`, d-class-body nu
garde `item`/`findMany()`/`Model` structurels (390–394) ; `d-class-body/experiments/noreg-model` indexe l'alias interne
par la classe (`Model<typeof Todo>`, plugins `import { Model as Item }`) et ajoute les contrôles de `rules` (§2, §7).

## 5. Les 8 fautes (`d-class-body`, TS6 = TS7 : mêmes diagnostics, fichier/ligne/colonne/code)
| # | Faute | Ligne | Diag. | `d-class-body` + `Register` (longueur) | sans `Register` (`noreg-model`) | d-named-args |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `() => TodoUsr` | oui | 3 | `Cannot find name 'TodoUsr'. Did you mean 'TodoUser'?` (52) | 52 | 52 |
| 2 | `'archivd'` | oui | 1 | `…parameter of type 'ScalarKeys<"Todo">'.` (89) | `ScalarKeys<typeof Todo>` (94) | 89 |
| 3 | `emial` | oui | 1 | `…'emial' does not exist in type 'Where<"TodoUser">'. Did you mean…` (136) | 141 | 136 |
| 4 | `item.isDeletd` | oui | 1 | `…on type 'Model<"Todo">'. Did you mean 'isDeleted'?` (85) | `Model<typeof Todo>` (90) | 85 |
| 5 | `mappedBy: 'asignee'` | non (`ultimabase.ts:9`) | 1 | **`Type 'typeof TodoUser' is not assignable to type 'typeof TodoUser & SchemaRegistrationError<"TodoUser.assignedTodos: mappedBy 'asignee' is not a field of Todo">'…`** (447) | 447 | 1 158 |
| 6 | `acess:` | oui | 5 | `…'acess' does not exist in type 'PostgresSchemaOption<"Todo"> & …'. Did you mean…` (261) | 267 | 261 |
| 7 | `where: () => 42` | oui | 1 | `…not assignable to type 'AccessFilterResult<"Tag">'.` (68) | 73 | 68 |
| 8 | `select: { titel }` | oui | 1 | `…'titel' does not exist in type 'Select<"Todo">'. Did you mean…` (133) | 138 | 133 |

7/8 sur la ligne, mêmes lignes et nombres que D ; TS6 = TS7. `.softDelete()` deux fois 29 (D 19) ; `className: 42` 34 (33) ;
`static rule = …` : silencieux avec `Register`, `Todo: static 'rule' holds rules; name it rules` (397) sans.

## 6. Performance
`node forms/d-class-body/tools/campaign.mjs` (méthode de d-named : `tools/bench.mjs`, `bench-rule.mjs`, `tsc
--extendedDiagnostics`, TS7 `tsc` + `lsp-bench.mjs`), séquentiel, 1 exécution à 10/50, **3 à 200 (médiane)**, charge
2,2–2,9, écarts < 15 %, 0 erreur TS6/TS7, hover `q0` 190. `gen.mjs` : forme `const` identique octet pour octet à
`d-named/gen-args` ; d-named retrouve sa campagne (1,60 contre 1,59). Brut : `d-class-body/results/`.

| 200 schémas | Froid | Éd.→diag | Éd.→tout | Schéma+hover | Règle | Tas | tsc6 check | Inst. | TS7 check (1 fil) | TS7 éd. | TS7 règle |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| d-named | 1,86 | 0,76 | 1,44 | 0,72 | 0,44 | 423 | 1,60 | 461 k | 0,32 (0,44) | 0,23 | 0,10 |
| d-named-args | 1,86 | 0,72 | 1,38 | 0,69 | 0,46 | 388 | 1,57 | 431 k | 0,30 (0,43) | 0,21 | 0,10 |
| d-class-body + `Register` | 2,51 | 1,01 | 2,05 | **1,85** | **1,76** | **605** | **2,23** | 506 k | **0,70** (0,62) | 0,29 | 0,46 |
| d-class-body sans `Register` | 2,22 | 0,77 | 1,93 | 0,76 | 0,14 | 386 | 1,91 | 515 k | 0,35 (0,56) | 0,23 | 0,02 |
| `noreg-model` (+ contrôles `rules`) | 2,23 | 0,78 | 1,98 | 0,77 | 0,14 | 394 | 1,93 | 522 k | 0,49 (0,56) | 0,23 | 0,02 |

À 10 / 50 : check d-named 0,31 / 0,63, d-class-body 0,40 / 0,84, sans registre 0,38 / 0,78. Avec `Register`, la classe
coûte **+42 % de check, ×2,7 à l'édition de schéma, ×3,8 à l'édition de règle, +56 % de tas**, et TS7 parallélise mal
(0,70 > 0,62 en un fil). Le contrôle des membres n'en explique que ~10 % (`experiments/no-member-check` : check 2,03,
règle 1,60, 1 exécution). Hypothèse non prouvée : résoudre le registre compare des classes dont les statiques incluent
`rules`, d'où la vérification de tous les `this.with` ; en D la constante ne porte pas les règles. Sans `Register` : niveau
d'E2 (1,81 dans BENCH.md), +22 % de check contre d-named-args, éditions identiques, règle 0,14 contre 0,46.

## 7. Verdicts et risques
- **`d-class-wrapper` : échec** (TS2506, vérificateur). **`d-build` : échec** (TS7022, ou nom perdu / 869 / `.d.ts` structurel).
- **`d-class-body` : viable**, `class Todo` partout (source, usage, `.d.ts` émis, JS), aides statiques typées, membres
  d'instance et redéfinitions refusés, 8 fautes inchangées (faute 5 : 1 158 → 447), TS6 = TS7. Mais **avec `Register`**
  elle est la plus lente des D mesurées et la provenance de `rules` n'est vérifiable qu'à l'exécution (faute de nom
  silencieuse). C'est en pratique E2 avec `define({ className, fields })` et les noms enregistrés.
- **Recommandation de l'expérience : `d-class-body` sans `Register` + `Model` indexé par la classe (`noreg-model`)** :
  infobulles nommées ≤ 51 (`WhereBuilder<typeof Todo>`, `Model<typeof Todo>`, `class Todo`), messages 52–141 sauf
  enregistrement, provenance et nom de `rules` vérifiés par les types, plus de ligne `Register`, perf = d-class-body-noreg.
  Coût : +22 % de check à 200 contre d-named-args, `typeof Todo` au lieu de `"Todo"` (5 caractères), une classe par schéma.
- Risques : (1) deux contournements de vérificateur (bissection) fragiles, à couvrir par tests TS6 et TS7 ; (2) `rules`
  absent de la complétion ; `Todo.` liste aussi `apply, bind, call…`, `with`, `rules` ; (3) TS9021 par classe (comme
  E1/E2) ; (4) TS2883 de l'alias interne `Model` (hérité) ; (5) Core 676 lignes ; (6) `Register` et contrôles de `rules`
  **incompatibles** (13 erreurs dans `noreg-model/fixture`, valide : `noreg-model/fixture-noreg`).
