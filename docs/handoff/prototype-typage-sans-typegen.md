# Typage sans génération : preuves pour la séance API

Spike de nuit, 2026-10-09, relançable ([README.md](README.md)). TypeScript 6.0.3
de `ub-small` (lecture seule), options de `tooling/tsconfig/base.json`.

## 1. Question

- **P1** : relations colocalisées (cycles, auto-relation, N-N avec `mappedBy`),
  `where`/`select`/`include` typés à travers elles, sans fichier généré.
- **P2** : options de plugins sur le schéma complet (`access.where`,
  `hooks.beforeSave(item)`), apportées par `.use(plugin)`, Core générique.

## 2. Ce que dit l'archive (et ce qui change cette fois)

| Tentative archivée                                           | Échec                                                                     | Source            |
| ------------------------------------------------------------ | ------------------------------------------------------------------------- | ----------------- |
| Cible paresseuse `target: () => User`                        | TS7022/TS7023 dès que User↔Post sont mutuels                              | 6301, itération 1 |
| Registre par module (`typeof import`) indexé par `className` | TS7022 + TS2615                                                           | 6301, itération 3 |
| Indexation par nom d'export                                  | compile, mais impose export = `className` (refusé)                        | 6301              |
| `access`/`hooks` dans le même `define`                       | callbacks typés sur un « schéma d'amorçage » puis rejetés ; TS7022/TS2615 | 6307, ADR-0280    |

**Toutes reproduites** dans `micro/` (E1, E3, E10, E11). Trois causes
distinctes, aucune fondamentale — c'est ce qui change cette fois :

1. **E1/E2** : `pointer<T>(t: () => T)` infère `T`, donc évalue `User` pendant
   que `Todo` est en cours : cycle. `pointer<F>(t: F)` capture le **type du
   thunk** sans le résoudre (cible lue plus tard par `F extends () => infer S`) :
   plus de cycle. L'archive inférait la cible.
2. **E3/E6** : le type de `const X = f(...)` dépend des corps des callbacks si
   `f` est **générique**. Si le dernier appel est **non générique**
   (`.with({...})`), TypeScript type la constante sans lire les arguments, puis
   vérifie les callbacks quand tout est résolu. Idem pour les membres statiques
   d'une classe, résolus un par un (E7, E12).
3. **ADR-0280** : le « schéma d'amorçage » est reproduit par `NoInfer` +
   `fields: (field) => …` (`scratch/single/a.ts`, S3) ; sans `NoInfer`, un
   schéma isolé marche (S1) mais pas un graphe cyclique (§4 A).

Aucune clé par nom d'export : `className` ≠ export reste permis.

### Micro-expériences (`micro/run.sh micro/eN`)

| #          | Forme                                                                                             | Résultat                        |
| ---------- | ------------------------------------------------------------------------------------------------- | ------------------------------- |
| E1         | `pointerT(() => User)` (cible inférée), cycle                                                     | TS7022, TS7024 (= archive)      |
| E2         | `pointerF(() => User)` (type du thunk capturé), cycle                                             | OK, `where` imbriqué exact      |
| E3         | E2 + callback qui **retourne** un filtre croisé, dans l'appel générique                           | TS7022, TS7023, TS2615 (= 6307) |
| E4, E5, E9 | callbacks à retour `void`, méthodes `ThisType`, contrainte `void` + validation à l'enregistrement | OK                              |
| E6         | `define2(...).with({ where })` non générique                                                      | OK, retours vérifiés            |
| E7, E12    | classe + `static`, y compris auto-référence dans `extends`                                        | OK                              |
| E8         | getters à la Zod 4 (`get owner() { … }`)                                                          | OK                              |
| E10 / E10c | chaîne contrainte par un registre `Register` / non contrainte, lue paresseusement                 | TS7022, TS2456 (= archive) / OK |
| E11        | options en callback dans l'appel générique                                                        | TS7022                          |

## 3. Le modèle

`lib/` (648 lignes) : scalaires/enum, `pointer`, `relation` + `mappedBy`,
`where` façon Prisma (`is`, `some`, `AND/OR/NOT`), `WhereBuilder`,
`select`/`include` imbriqués, résultat exact aplati, `createOne`,
`UltimaBase.use(...)`, `new App({ schemas })` avec contrôles. Plugins
(`access`, `hooks`, `acl` + champ, `softDelete` + champ `isDeleted`,
`postgres`) écrits contre un emplacement générique de Core
(`SchemaOptionsHKT`, le plugin écrit `AccessSchemaOption<this['schema']>`) :
**Core ne nomme aucun plugin.**

Fixture (`variants/*/src`) : User, Role, Todo, Tag ; User↔Todo, Todo↔Todo
(`parent`/`subtasks`), Todo↔Tag et User↔Role (N-N) ; filtres d'accès croisés
**dans les deux sens** (User→Todo, Todo→User, Role→User→Todo), hook lisant un
champ de plugin, ACL lisant l'entrée de création ; `usage.ts` : 8 assertions
exactes, 5 `@ts-expect-error` effectifs.

## 4. Variantes

### A. Objet unique (forme actuelle sans génération) — échoue

```ts
export const Todo = App.Schema.define({
	className: 'Todo',
	fields: (field) => ({
		assignee: field.pointer({ target: () => User }) /* … */,
	}),
	access: { read: { where: ({ where }) => where.eq('archived', false) } },
	hooks: {
		beforeSave: ({ item }) => {
			/* … */
		},
	},
})
```

23 erreurs. Sans `NoInfer`, un filtre objet retourné devient candidat
d'inférence de `fields` (`{ assignee: unknown }`) ; avec `NoInfer` (total ou
sur `TFields`) : schéma d'amorçage (ADR-0280) ; sans filtre objet : **`any`
silencieux** (`RelationField<() => any, "tags">`). Trois formes échouent :
arrêt. P1 oui, P2 non.

### B. Objet unique, retours des callbacks « relâchés » en `void`

Même code que A, `defineLoose`. Compile (0 erreur) mais : faute dans un filtre
objet **non détectée**, retour faux (`where: () => 42`) **non détecté**, et une
faute de clé (`acess:`) fait s'effondrer l'inférence du schéma entier
(20 diagnostics en cascade jusque dans `usage.ts`). P1 oui, P2 partiel.

### C. Cibles en chaîne + registre déclaré + `.with()`

```ts
export const Todo = App.Schema.declare({
	className: 'Todo',
	fields: (field) => ({
		assignee: field.pointer({ target: 'User', onDelete: 'setNull' }),
	}),
}).with({ access: {/* … */} })
// application.ts
export const schemas = [User, Role, Todo, Tag] as const
export const app = new App({ schemas })
declare module '@ultimabase/core' {
	interface Register {
		readonly schemas: typeof schemas
	}
}
```

0 erreur, aucun import entre schémas. Mais `as const` + `declare module` à
écrire ; `target: 'Usr'` signalé dans `application.ts` (TS2719 illisible +
cascade) ; le registre ne doit jamais être lu par une contrainte (sinon E10) ;
le plus lent à 200 (§5).

### D. Deux temps : `declare(...).with(...)`

```ts
export const Todo = App.Schema.declare({
	className: 'Todo',
	fields: (field) => ({
		assignee: field.pointer({ target: () => User, onDelete: 'setNull' }),
		parent: field.pointer({ target: () => Todo }),
		subtasks: field.relation({ target: () => Todo, mappedBy: 'parent' }),
	}),
}).with({
	access: {
		read: { where: ({ where }) => where.eq('archived', false) },
		update: {
			where: ({ where, userId }) =>
				where.is('assignee', (user) => user.eq('id', userId ?? '')),
		},
	},
	hooks: {
		beforeSave: ({ item }) => {
			if (item.isDeleted) throw new TypeError('deleted')
		},
	},
})
```

0 erreur ; 8/8 fautes détectées, sur la ligne sauf `mappedBy` (enregistrement).
Hovers longs (type anonyme imprimé en structure). Repose sur `.with` = une
signature unique non générique.

### E. Déclaration de classe — meilleure variante mesurée

```ts
export class Todo extends App.Schema('Todo', (field) => ({
	title: field.string({ required: true }),
	assignee: field.pointer({ target: () => User, onDelete: 'setNull' }),
	parent: field.pointer({ target: () => Todo }),
	subtasks: field.relation({ target: () => Todo, mappedBy: 'parent' }),
})) {
	static readonly options: Options<typeof Todo> = {
		access: { read: { where: ({ where }) => where.eq('archived', false) } },
		hooks: {
			beforeSave: ({ item }) => {
				if (item.isDeleted) throw new TypeError('deleted')
			},
		},
	}
}
// factory.ts, une ligne par application :
export type Options<TSchema> = SchemaOptionsOf<typeof App, TSchema>
```

0 erreur. Options **annotées** : aucune inférence, donc aucun cycle possible,
typage contextuel et contrôle d'excès complets ; TypeScript nomme les classes
(hovers, messages courts). `e-class-configure` (`options = Todo.configure({…})`,
non générique) compile aussi, hovers 639 ; `configure<TSelf>` générique : TS7022.

### Qualité des diagnostics et hovers (sonde language service, `results/probe-*.md`)

| Cas                                   | C                                   | D                                                      | E                                                                                                           |
| ------------------------------------- | ----------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `target: () => Usr`                   | TS2719 à l'enregistrement + cascade | `Cannot find name 'Usr'. Did you mean 'User'?` (ligne) | idem D                                                                                                      |
| `where.eq('archivd', …)`              | ligne, type long                    | ligne, type long                                       | ligne : `…parameter of type 'ScalarKeys<typeof Todo>'`                                                      |
| champ croisé (objet) `emial`          | ligne                               | ligne                                                  | ligne : `'emial' does not exist in type 'Where<typeof User>'. Did you mean 'email'?`                        |
| `item.isDeletd` (champ de plugin)     | ligne                               | ligne                                                  | ligne, `Did you mean 'isDeleted'?`                                                                          |
| `mappedBy: 'asignee'`                 | enregistrement, illisible           | enregistrement, long                                   | enregistrement : `SchemaRegistrationError<"User.assignedTodos: mappedBy 'asignee' is not a field of Todo">` |
| `acess:`                              | ligne (+4 `any` implicites)         | idem                                                   | idem : `'acess' does not exist in type 'Options<typeof Todo>'`                                              |
| `where: () => 42`                     | ligne                               | ligne                                                  | ligne : `…not assignable to type 'AccessFilterResult<typeof Tag>'`                                          |
| Hover `where` (callback)              | 638                                 | 945                                                    | **44** (`WhereBuilder<typeof Todo>`)                                                                        |
| Hover cible croisée                   | 459                                 | 969                                                    | **43** (`WhereBuilder<typeof User>`)                                                                        |
| Hover `item` (hook)                   | 427                                 | 427                                                    | 427 (objet résolu)                                                                                          |
| Hover résultat `findMany` + `include` | 307                                 | 307                                                    | 307 (objet résolu ; réel actuel 1 188, sonde de perf 190 contre 809)                                        |

### `isolatedDeclarations`

Le modèle de Core et les plugins passent (`.d.ts` émis sans erreur). Le code
applicatif inféré échoue partout : TS9010 (constante, C/D), TS9021 (`extends`
d'une expression, E) — comme aujourd'hui (les exemples désactivent l'option).
Les schémas fournis **par un paquet** (Roles, Password Auth) devront annoter
(`const RoleBase: SchemaBaseClass<…> = …; class Role extends RoleBase`, à prouver).

## 5. Mesures

Machine : 12 cœurs, 64 Gio, charge 1 min 2,0–3,7, aucun autre processus
actif. 3 processus neufs par point, médiane. Scénario de la sonde Typegen
réelle (`editor-probe-runner.mjs`) : froid = `createProgram` +
`getPreEmitDiagnostics` ; édition = `'valid'` → `42` dans une requête puis
`getSemanticDiagnostics` du fichier. « Tout » = tout le projet re-vérifié
(borne haute, comparable au fichier unique réel). Générateur : par schéma
6 scalaires, `next` (anneau S0→…→S0), inverse `prevs` (`mappedBy`), pointeur
sur soi 1 fois sur 5, `access` (filtre local + filtre croisé), `hooks`, `acl`,
`postgres` ; un fichier par schéma ; un `findMany` (`where` croisé, `select`,
`include`) par schéma. Unités : s, Mio.

| Schémas | Variante                      | Froid | Édition → diag | Édition, tout | Champ de schéma édité + hover | Tas max | tsc check | tsc mémoire | Instanciations |
| ------- | ----------------------------- | ----- | -------------- | ------------- | ----------------------------- | ------- | --------- | ----------- | -------------- |
| 10      | **Typegen réel** (cette nuit) | 3,56  | 2,01           | —             | —                             | 815     | —         | —           | —              |
| 10      | C chaînes                     | 0,40  | 0,07           | 0,14          | 0,08                          | 78      | 0,23      | 49          | 30 550         |
| 10      | D deux temps                  | 0,39  | 0,07           | 0,14          | 0,07                          | 97      | 0,23      | 47          | 29 708         |
| 10      | E classe                      | 0,40  | 0,08           | 0,15          | 0,08                          | 85      | 0,24      | 50          | 27 403         |
| 50      | **Typegen réel**              | 8,07  | 6,81           | —             | —                             | 1 539   | —         | —           | —              |
| 50      | C                             | 0,79  | 0,20           | 0,49          | 0,20                          | 154     | 0,61      | 97          | 141 678        |
| 50      | D                             | 0,69  | 0,18           | 0,41          | 0,17                          | 165     | 0,51      | 82          | 113 380        |
| 50      | E                             | 0,72  | 0,21           | 0,42          | 0,20                          | 158     | 0,54      | 95          | 101 747        |
| 200     | **Typegen réel**              | 42,83 | 48,86          | —             | —                             | 5 610   | —         | —           | —              |
| 200     | C                             | 2,87  | 0,89           | 2,64          | 0,92                          | 472     | 2,53      | 161         | 900 408        |
| 200     | D                             | 1,56  | 0,62           | 1,39          | 0,56                          | 273     | 1,29      | 158         | 427 150        |
| 200     | E                             | 1,66  | 0,68           | 1,40          | 0,67                          | 330     | 1,36      | 164         | 380 537        |

Référence du plan (3,5/2,0/830 ; 8–9/7/1,5 Gio ; 44/50/5,6 Gio) reproduite à
±3 % (`tools/real-baseline`, `ub-small` `5f604d3d` construit ; fichier généré
120/577/2 296 Ko, modèle : 0). Partout 0 diagnostic initial, 1 après édition.
Brut : `results/*.jsonl`, `node tools/summarize.mjs`.

Lecture : de 10 à 200 schémas (×20), D/E font ×4 à froid et ×9 à l'édition,
contre ×12 / ×25 pour Typegen réel. **Chiffres absolus non comparables** (§7).

### Trois pièges de performance trouvés (corrigés dans le modèle, à reporter dans Core)

1. **Contrainte fonction sur la cible** : `TTarget extends () => void` (ou
   `(() => unknown) | string`) fait évaluer le retour du thunk pendant
   l'inférence : la déclaration de S0 résout S1, qui résout S2… Débordement de
   pile de `tsc` à **50 schémas** en anneau (`scratch/bisect`). Avec
   `object | string` (ou sans contrainte) : plus rien. Note : le `pointerField`
   bas niveau actuel de Core type `SchemaTarget<TSchema> = () => TSchema`
   (`packages/core/src/schema/schema/targets.ts:24`) : il infère la cible,
   c'est le motif E1 qui cycle ; à remplacer par la capture du type du thunk.
2. **Retour d'un builder générique marqué par le type complet** :
   `WhereExpression<TSchema>` en position de retour d'un callback déclenche
   l'inférence depuis le type contextuel, qui parcourt tout le graphe :
   coût par schéma proportionnel à N, donc **quadratique** (D à 200 :
   27,1 s de check ; E : 72 s). Marquer par le nom (`WhereExpression<'Todo'>`)
   ramène D à 1,3 s. `NoInfer` sur le retour n'aide pas (le contexte est la
   _source_ de l'inférence). Mesure : `scratch/toggle2.py`.
3. **Intersection d'interfaces HKT à type `this`** (`A & B` de plugins) :
   TS2589 immédiat. Corrigé en accumulant un tuple d'HKT à `.use()`
   (`scratch/hkt/b.ts`).

## 6. Verdict par variante (grille du plan)

| Critère                     | A                               | B                              | C                  | D                                       | E                                    |
| --------------------------- | ------------------------------- | ------------------------------ | ------------------ | --------------------------------------- | ------------------------------------ |
| Sans génération             | non (erreurs, `any` silencieux) | oui                            | oui                | oui                                     | oui                                  |
| P1 cycles / auto / N-N      | oui seul, non avec P2           | oui                            | oui                | oui                                     | oui                                  |
| P2 exact                    | non                             | partiel (retours non vérifiés) | oui                | oui                                     | oui                                  |
| Colocalisation              | oui                             | oui                            | oui                | oui                                     | oui                                  |
| Une forme                   | oui                             | oui                            | 2 temps + registre | 2 temps                                 | classe + annotation                  |
| Erreurs sur la ligne        | —                               | partiel, cascades              | cible : non        | oui sauf `mappedBy`                     | oui sauf `mappedBy`, messages courts |
| Hovers (cas courant)        | —                               | ~900                           | ~640               | ~950                                    | **44**                               |
| Perf (modèle, 200)          | —                               | non mesuré                     | 2,87 s / 0,89 s    | 1,56 s / 0,62 s                         | 1,66 s / 0,68 s                      |
| Mécanisme TS dont on dépend | —                               | retour `void`                  | registre paresseux | signature non générique (chemin rapide) | annotation (aucune inférence)        |

**Verdict** : P1 et P2 sont **résolubles sans génération**, avec cycles,
auto-relation, plusieurs-à-plusieurs et filtres croisés dans les deux sens, à
condition que **les options qui voient le schéma complet ne soient pas dans
l'appel générique qui infère les champs**. La forme « un seul objet » (A/B)
est la seule qui ne tient pas. E est la plus robuste (annotation explicite :
aucune inférence à casser) et la plus lisible ; D est la plus proche de l'API
actuelle.

## 7. Biais et risques ouverts

- **Modèle plus simple que Core** : ni objets imbriqués, écritures imbriquées,
  champs virtuels, méthodes de modèle, opérateurs de plugins dans `where`
  (ADR-0281), `PasswordUserSchema`/`RoleSchema`, gabarits de projection. À 10
  schémas : 0,40 s à froid contre 2,50 s pour le vrai Core _sans_ fichier
  généré (mode « source » de l'inventaire). Seules la **forme de croissance**
  et l'**absence de cycle** sont prouvées ; la tranche réelle (phase 5) reste
  nécessaire.
- **Champs de plugin conditionnels** (`softDelete: true` → `isDeleted`) : non
  modélisés. En D/E, une option de première phase ou une méthode de champ
  (`field.softDelete()`) serait nécessaire ; à prouver.
- **D dépend d'une optimisation non documentée de TypeScript** (appel non
  générique typé sans ses arguments) ; E seulement d'annotations et de la
  résolution paresseuse des membres de classe.
- `mappedBy`/cible invalides : vus à `new App(...)` seulement (schéma non enregistré : jamais).
- Classes (E) : `options` doit rester une donnée inerte ; vérifier gel,
  héritage (`extends Todo` à interdire ?), usage JavaScript.
- Hover de `item` : 427 caractères (cible 300) ; `isolatedDeclarations` des
  schémas de paquets (§4).

## 8. Options pour la séance

1. **Classe + options annotées (E)**. Pour : aucune génération, aucun cycle
   par construction, meilleurs hovers et messages (`Where<typeof User>`),
   cohérent avec l'API de classe (`Todo.findMany`, modèles immuables). Contre :
   forme nouvelle, alias `Options` par application, nom écrit deux fois
   (`'Todo'`, `typeof Todo`), annotation requise dans les paquets.
2. **Deux temps (D)** — `App.Schema.declare({ className, fields }).with({ access, hooks })`.
   Pour : le plus proche de l'actuel, migration mécanique. Contre : hovers
   longs (structure anonyme), dépend du chemin rapide non générique de TS,
   deux appels pour un concept.
3. **Repli Typegen réduit** — garder la génération seulement si la tranche
   réelle (phase 5) échoue sur les champs conditionnels ou les opérateurs de
   plugins ; dans tous les cas, appliquer les trois correctifs du §5 (ils
   valent aussi avec Typegen) et abandonner les cibles en chaîne (C) : plus
   lentes, erreurs de cible illisibles, registre à déclarer.

Prochaine action : tranche verticale E (puis D) sur le vrai Core (worktree) —
deux schémas en cycle dans deux fichiers, `access`/`hooks`, un champ de plugin
conditionnel, mesures 10/50/200 contre `tools/real-baseline`.

## 9. Infobulles courtes pour D

**`WhereBuilder<"Todo">` (39 caractères) est atteignable pour D, mais seulement avec
un registre déclaré une fois par application** ; sans aucune ligne de plus, c'est
impossible. Code : `lib-short/`, `lib-named/`, `variants/d9-*`, `short/m1-printing/`.

### Pourquoi D ne peut pas, tel quel

TypeScript imprime un type par son identité : interface ou alias **avec tous ses
arguments** (l'élision des arguments par défaut n'existe que pour `Iterable` et
ses variantes, `typeReferenceToTypeNode`), et `typeof X` seulement si `X` est une
classe, un enum, un namespace ou une fonction déclarée (`createAnonymousTypeNode`).
Une `const` n'en fait pas partie. Donc un type imprimé `WhereBuilder<"Todo">`
dépend **uniquement** de `"Todo"` : ses champs ne peuvent venir que d'une table
globale nom → schéma, c'est-à-dire d'une fusion de déclarations écrite quelque
part. Rien dans le code de D n'en crée.

| Essai                                                                                            | Code développeur vs D                  | `where` / cible croisée          | Verdict                                                                                              |
| ------------------------------------------------------------------------------------------------ | -------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Idée 1 pure : nom + membre fantôme (`WhereBuilder<'Todo', S>`)                                   | aucun                                  | `S` imprimé (≈ D)                | impossible sans table (argument d'identité ci-dessus)                                                |
| Idée 2 : `declare()` → `DeclaredSchema<'Todo', F, AppTypes<…>>` (interface nommée, champs bruts) | aucun                                  | 833 / 857 (D : 945 / 969)        | échec : `F` imprimé en entier ; idem avec une `declare class` (micro m1 : 338 = 338)                 |
| Idée 3 : enveloppe opaque `Opaque<'Todo'> & { '~fields': F }`                                    | aucun                                  | micro m1 : 378 (idée 2 : 338)    | échec, pire                                                                                          |
| Idée 4 : réglages d'impression                                                                   | —                                      | —                                | aucun réglage par type ; troncature fixe (survol 500, erreurs 160) ; `noErrorTruncation` non utilisé |
| Idée 4 bis : callback générique `<TSchema extends S>(ctx) => …`                                  | aucun                                  | **40** (`WhereBuilder<TSchema>`) | échec : 2 erreurs TS2345 sur du code **valide** (clés différées), nom du schéma perdu                |
| **Registre par nom, lu paresseusement**                                                          | +5 lignes, une fois (`application.ts`) | **39 / 38**                      | **réussi**                                                                                           |

### Ce qui marche : registre d'application + références par nom

Seule différence du code développeur avec D (chemins d'import mis à part) :

```ts
// application.ts, une fois par application (pas par schéma, pas de `as const`)
export const app = new App({ schemas: [User, Role, Todo, Tag] })
declare module '@ultimabase/core' {
	interface Register {
		readonly app: typeof app
	}
}
```

Forme côté Core (`lib-short/types.ts`, `core.ts`) ; **plugins inchangés**, Core ne
nomme toujours aucun plugin :

```ts
export interface Register {}
type RegisteredList = Register extends {
	readonly app: { readonly schemas: infer L extends readonly unknown[] }
}
	? L
	: readonly []
type SchemasByName = {
	readonly [S in RegisteredList[number] as ClassNameOf<S>]: S
} // calculé une fois
type RegisteredNames = ClassNameOf<RegisteredList[number]>
/** Le nom si le schéma est enregistré, sinon le type complet (repli silencieux). */
export type SchemaRef<S> = S extends string
	? S
	: ClassNameOf<S> extends RegisteredNames
		? ClassNameOf<S>
		: S
export type FieldsOf<TRef> =
	SchemaOf<TRef> extends { readonly '~fields': infer F } ? F : never // accepte nom ou schéma
// ConfigurableSchemaClass : with(options: SchemaOptionsFor<THKTs, SchemaRef<this>>): this
// Where/Include : cibles en SchemaRef ; Item<S> = Readonly<Writable<Result<S, {}>>>
// WhereBuilder.is/some : target: (where: TargetBuilders<S>[K]) => NoInfer<TargetExpressions<S>[K]>
```

Registre lu seulement en positions paresseuses (paramètre de `.with`, callbacks,
requêtes), jamais en typant une constante de schéma : 0 cycle/TS7022 (E10 évité).
Identique sur les `.d.ts` émis (`scratch/dts/`), sans `declarationMap`.

### Avant / après (fixture User/Role/Todo/Tag)

| Point de sonde (§4)             | D     | D + registre                                                                      | E   |
| ------------------------------- | ----- | --------------------------------------------------------------------------------- | --- |
| `where` (callback)              | 945   | **39** `WhereBuilder<"Todo">`                                                     | 44  |
| cible croisée `(user) =>`       | 969   | **38** `WhereBuilder<"User">`                                                     | 43  |
| `item` (hook)                   | 427   | **329** `Readonly<{ acl: ACL; assignee: PointerRef \| null; … }>`                 | 427 |
| `const Todo`                    | 924   | 924 (irréductible : c'est le type que le registre désigne)                        | 10  |
| `.with({`                       | 1 385 | 887 (`with(options: AccessSchemaOption<"Todo"> & HooksSchemaOption<"Todo"> & …)`) | 45  |
| résultat `findMany` + `include` | 307   | 307                                                                               | 307 |

Diagnostics (8/8 sur la ligne fautive, sauf `mappedBy` comme avant) :

| Faute                                  | D + registre                                                                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `() => Usr`                            | `Cannot find name 'Usr'. Did you mean 'User'?`                                                                                                                |
| `where.eq('archivd', …)`               | `…not assignable to parameter of type 'ScalarKeys<"Todo">'.`                                                                                                  |
| croisé builder `todo.eq('archivd', …)` | idem, `ScalarKeys<"Todo">`                                                                                                                                    |
| croisé objet `emial`                   | `'emial' does not exist in type 'Where<"User">'. Did you mean to write 'email'?`                                                                              |
| `item.isDeletd`                        | `…on type 'Readonly<{ acl: ACL; … }>'. Did you mean 'isDeleted'?`                                                                                             |
| `mappedBy: 'asignee'`                  | à l'enregistrement, long (inchangé)                                                                                                                           |
| `acess:`                               | `'acess' does not exist in type 'AccessSchemaOption<"Todo"> & HooksSchemaOption<"Todo"> & …'. Did you mean to write 'access'?` (+4 `any` implicites, comme D) |
| `where: () => 42`                      | `Type 'number' is not assignable to type 'AccessFilterResult<"Tag">'.`                                                                                        |

En plus : mauvais schéma retourné dans `is` → `'WhereExpression<"Todo">' is not assignable to type 'WhereExpression<"User">'` ;
`item.title = ''` → TS2540 ; schéma hors `new App` ou registre absent → 0 erreur, hovers de D.

### Performance (même machine, charge 2,2–3,1, 3 processus neufs, médianes)

| Schémas | Variante     | Froid | Édition → diag | Édition, tout | Champ édité + hover | Tas max | tsc check | Instanciations |
| ------- | ------------ | ----- | -------------- | ------------- | ------------------- | ------- | --------- | -------------- |
| 10      | D            | 0,40  | 0,07           | 0,14          | 0,07                | 97      | 0,23      | 29 708         |
| 10      | D + registre | 0,43  | 0,08           | 0,14          | 0,07                | 89      | 0,24      | 31 611         |
| 50      | D            | 0,72  | 0,19           | 0,41          | 0,17                | 165     | 0,52      | 113 380        |
| 50      | D + registre | 0,74  | 0,21           | 0,40          | 0,21                | 161     | 0,57      | 126 667        |
| 200     | D            | 1,58  | 0,61           | 1,38          | 0,56                | 275     | 1,31      | 427 150        |
| 200     | D + registre | 1,80  | 0,72           | 1,41          | 0,69                | 379     | **1,50**  | 483 127        |

**Régression à 200** : check +15 % (1,50 s, cible 1,3 s non tenue), édition
+18 % (0,72 s, cible 0,7 s dépassée de peu), tas +100 Mio. Croissance toujours
linéaire. ~0,07 s viennent de l'évaluation du registre, ~0,07 s de
l'indirection `FieldsOf` (`scratch/rtoggle.py`) ; `Extract` par nom (1,94 s) et
table nom → champs (2,29 s) sont plus lents.

Piège (à reporter dans Core) : `is`/`some` typés `WhereBuilder<TargetRef<FieldsOf<S>[K]>>`
avec `K` générique élargissent la contrainte à l'union de **tous** les schémas
enregistrés à chaque appel : 5,5 s à 200 ; indexer `TargetBuilders<S>[K]` : 1,5 s.

### Risques

- Une déclaration de module par application, à ne pas oublier ; l'oubli ne
  casse rien mais rend les hovers longs sans avertissement (un diagnostic
  « application non enregistrée » serait à concevoir). Peut venir du gabarit
  `create-app`.
- Invariant à garder dans Core : aucune contrainte ni type de déclaration ne lit
  le registre (sinon E10 : TS7022). À protéger par un test de cycle.
- Deux schémas de même `className` : le registre les confondrait ;
  l'enregistrement doit le refuser.
- `const Todo`, `.with(` et l'erreur `mappedBy` restent longs ; E reste meilleur
  sur ces points sans registre. `lib-short` abandonne les cibles en chaîne (C).

## 10. Variante F : méthodes de plugin

Code : `lib-f/`, `variants/f-plugin-methods/` (forme demandée), `variants/f-last-call/`
(forme qui compile), `variants/f-factories/` (fabriques), `results/probe-f-*.md`.

**Verdict : la forme demandée échoue sur la fixture (TS7022).** TypeScript ne type
« sans lire les arguments » que le **dernier** appel de la chaîne (le chemin rapide
qui fait marcher D) ; chaque appel précédent est le récepteur du suivant et est
vérifié entièrement — callbacks compris — pendant le typage de la constante.
`User…access(filtre vers Todo).hooks(…)` et `Todo…access(filtre vers User).acl(…).hooks(…)`
forment donc le cycle d’E3 : TS7022 sur `User`/`Todo`, TS7023, cascades (40 erreurs,
avec ou sans registre). Le registre du §9 est **incompatible** : tout appel non
final dont le paramètre dépend du schéma lit `typeof app` pendant le typage
(TS7022 sur `app`), même sans filtre croisé.

F compile (0 erreur) **sans registre**, si les callbacks qui lisent un autre
schéma sont dans le dernier appel, ou ne vont que dans un sens (Tag → Todo dans un
appel non final : 0 erreur ; User → Todo non final avec Todo → User final : 0
erreur). La règle dépend du graphe : invisible, et sa violation donne un TS7022 loin
de la cause.

### Code développeur (forme qui compile)

```ts
export const Todo = App.Schema.define({ className: 'Todo', fields: (field) => ({ /* … */ }) })
	.softDelete()                                   // méthode de forme : ajoute isDeleted
	.indexes([{ fields: ['completed', 'dueAt'] }])  // clés vérifiées : ScalarKeys<schema>
	.postgres({ table: 'todos' })
	.acl({ default: (data) => /* … */ })
	.hooks({ beforeSave: ({ item }) => { if (item.isDeleted) throw new TypeError('deleted') } })
	.access({ update: { where: ({ where, userId }) => where.is('assignee', (u) => u.eq('id', userId ?? '')) } }) // filtres croisés : en dernier
export const TodoRole = App.RoleSchema.define({ className: 'TodoRole', members: () => TodoUser,
	fields: (field) => ({ description: field.string() }) }).access({ read: { where: … } })
export const TodoUser = App.PasswordUserSchema.define({ className: 'User', fields: (field) => ({ /* … */ }) })
	.postgres({ table: 'users' }).hooks({ … }).access({ … where.some('roles', (role) => role.eq('name', 'admin')) … })
```

### Code auteur de plugin

```ts
// Méthode : une interface d'arguments (`this` est interdit dans un littéral imbriqué : TS2526).
export interface AccessMethodTypes<TSchema> {
	readonly access: SchemaMethod<[options: AccessOptions<TSchema>]>
}
export interface AccessMethods extends SchemaMethodsHKT {
	readonly methods: AccessMethodTypes<this['schema']>
}
export declare const accessPlugin: () => PluginDefinition<
	'access',
	AccessMethods
>
// Méthode de forme : deuxième argument = champs ajoutés.
export interface SoftDeleteMethods extends SchemaMethodsHKT {
	readonly methods: {
		readonly softDelete: SchemaMethod<
			[],
			{ readonly isDeleted: ScalarField<'boolean', boolean, true> }
		>
	}
}
// Fabrique : une signature `define` écrite par le plugin, retour construit par Core.
export interface RoleSchemaFactory<TApp extends AppTypes> {
	define<
		const TName extends string,
		const TMembers extends object,
		const TFields = {},
	>(declaration: {
		readonly className: TName
		readonly members: TMembers
		readonly fields?: (field: FieldBuilder) => TFields
	}): FactorySchema<
		'RoleSchema',
		TName,
		TFields & RoleOwnedFields<TMembers>,
		TApp,
		RoleModel
	>
}
export interface RoleFactoryTypes<TApp extends AppTypes> {
	readonly RoleSchema: RoleSchemaFactory<TApp>
}
export interface RoleFactories extends SchemaFactoriesHKT {
	readonly factories: RoleFactoryTypes<this['app']>
}
export declare const rolesPlugin: () => PluginDefinition<
	'roles',
	NoSchemaMethods,
	object,
	RoleFactories
>
```

Côté Core (générique, aucun nom de plugin) : `SchemaMethodsHKT`, `SchemaMethod<Args, Fields>`,
`SchemaFactoriesHKT`, `FactorySchema`, et `SchemaChain` = type mappé dont les **clés et
retours** viennent d'une instanciation indépendante du schéma (`SchemaMethodsFor<HKTs, never>`)
et dont seuls les **paramètres** lisent le schéma ; un état de chaîne
`ChainState<used, shapeOpen>` retire les méthodes appelées et, après la première méthode
de comportement, les méthodes de forme. Toutes les méthodes sont non génériques.

### Réponses

| Question                         | Résultat (sonde)                                                                                                                                                                                                                                                                   |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Méthodes = plugins installés  | Complétion après `define(…).` : `access, acl, hooks, indexes, postgres, softDelete` (+ `className, findMany, createOne`) ; fabrique à un plugin : `access` seul ; après `.acl(…)` : `access, hooks`                                                                                |
| 1. Fabriques = plugins installés | `App.` : `PasswordUserSchema, RoleSchema, Schema, use` (+ membres de `Function`, déjà présents en D) ; sans ces plugins : `Schema, use` ; `MiniApp.RoleSchema` → TS2339 sur la ligne                                                                                               |
| 2. Forme / visibilité            | `item.isDeleted` typé après `.softDelete()` ; hook placé avant → `Property 'isDeleted' does not exist` puis `softDelete` refusé (TS2339)                                                                                                                                           |
| 2. Cycles                        | voir verdict ; fabriques : TodoUser ↔ TodoRole (`members: () => TodoUser`, filtres croisés vers le rôle dans les deux sens, en dernier appel) : 0 erreur                                                                                                                           |
| 2. Fabriques typées              | `username`/`email` (propriétaire) dans `item` et les résultats ; `TodoUser.signUp(...)` typé par le `CreateInput` du schéma (mot de passe et champs requis vérifiés par 2 `@ts-expect-error`) ; `TodoRole.addMember('r1', …)` → TS2345 ; les méthodes de plugin restent chaînables |
| 3. Deux fois / ordre / inconnue  | TS2339 `Property 'access' does not exist on type 'Schema<"Tag", …>'` (long) ; idem `softDelete` après `.access` ; `.hooks` sans le plugin : TS2339                                                                                                                                 |
| 3. Une seule fabrique par plugin | `new App({ schemas: [TodoUser, …, Customer] })` → TS2322 sur les deux, dont `SchemaRegistrationError<"Customer: factory 'PasswordUserSchema' already created another registered schema">` (texte dans l'élaboration, après le type long)                                           |
| 4. Hovers (sans registre)        | `where` 864, croisé 914, `item` 329, `const Todo` 861, `.access(` 891 ; rôle : `where` 931, `role` 965                                                                                                                                                                             |
| 4. 8 fautes                      | 8/8 sur la ligne (`mappedBy` à l'enregistrement comme D), messages longs (`ScalarKeys<DefinedSchema<"Todo", { … }>>`) ; `.acess(` : `Did you mean 'access'?` + 10 en cascade (D : 4) car `Todo` devient `any`                                                                      |
| 4. `isolatedDeclarations`        | `lib-f` passe ; application : TS9010 par constante + TS9007 par thunk, comme D (9 + 8)                                                                                                                                                                                             |

### Performance (charge 3,2–5,4 ; 3 processus neufs, médianes)

| Schémas | Variante  | Froid              | Édition → diag         | Édition, tout      | Champ édité + hover    | Tas max         | tsc check          | Instanciations              |
| ------- | --------- | ------------------ | ---------------------- | ------------------ | ---------------------- | --------------- | ------------------ | --------------------------- |
| 10      | D / E / F | 0,39 / 0,40 / 0,41 | 0,07 / 0,08 / 0,10     | 0,14 / 0,15 / 0,15 | 0,07 / 0,08 / 0,11     | 97 / 85 / 124   | 0,23 / 0,24 / 0,26 | 29 708 / 27 403 / 37 068    |
| 50      | D / E / F | 0,69 / 0,71 / 0,80 | 0,18 / 0,21 / 0,31     | 0,41 / 0,44 / 0,45 | 0,17 / 0,20 / 0,31     | 165 / 157 / 175 | 0,52 / 0,54 / 0,61 | 113 380 / 101 747 / 155 988 |
| 200     | D / E / F | 1,57 / 1,66 / 1,87 | 0,58 / 0,66 / **1,08** | 1,34 / 1,38 / 1,60 | 0,54 / 0,66 / **1,06** | 280 / 327 / 488 | 1,29 / 1,38 / 1,60 | 427 150 / 380 537 / 601 938 |

Générateur F : `.softDelete().postgres().acl().hooks().access()` par schéma, filtre
croisé dans `.access` final. Linéaire, mais édition ×1,9 par rapport à D à 200. Deux
pièges corrigés (`scratch/ftoggle.py`) : un schéma vu par les méthodes qui dépendait
de l'état de chaîne recalculait filtres/items à chaque appel (check 1,69 → 1,33 s sans
`usage.ts`) ; une vérification « une fabrique » par paires était quadratique
(1,0 M → 0,6 M instanciations).

### Risques et options

- Règle d'ordre implicite (callbacks croisés en dernier) imposée par un détail de
  TypeScript ; erreur TS7022 loin de la cause ; aucun moyen de la diagnostiquer
  proprement côté Core.
- Pas de hovers courts (registre impossible), messages et cascades plus longs que D.
- Une seule méthode de comportement « libre » par chaîne en pratique : c'est `.with`.
- Option F-b (non mesurée) : chaîner seulement les méthodes **sans callback**
  (`softDelete`, `indexes`, `postgres`, fabriques) et finir par **un** appel qui porte
  tous les callbacks (`.with({ access, hooks, acl })`, D + registre) : garde les
  fabriques et les méthodes de forme, retrouve les hovers courts du §9.
