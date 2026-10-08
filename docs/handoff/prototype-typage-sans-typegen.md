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
