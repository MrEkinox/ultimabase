# API « avant » : ce qu'écrit le développeur de `examples/todo-backend`

Date : 2026-10-08, branche `api-challenge`. Entrée de la phase 2 de
[api-challenge-plan.md](api-challenge-plan.md) : photographie factuelle de
l'API actuelle telle que la vit l'application de référence, pour écrire
l'API idéale à côté. Aucune proposition ici.

Fichiers lus (tous ceux suivis par Git sous `examples/todo-backend`) :
`package.json`, `tsconfig.json`, `README.md`, `src/schema.ts`,
`src/create-application.ts`, `src/application.ts`, `src/main.ts`,
`src/todos.ts`, `src/admin.ts`, `.ultimabase/schema.generated.d.ts`.
Déjà couvert ailleurs, non répété : erreurs sans fichier généré et défaut
`include` → `never` ([core.md §3](api-inventory/core.md)), flux Typegen
([typegen.md](api-inventory/typegen.md)), `default: true` d'Access
([access-plugin.md](api-inventory/access-plugin.md)), `resolveCurrent` absent
([roles-plugin.md](api-inventory/roles-plugin.md),
[acl-permissions-plugin.md](api-inventory/acl-permissions-plugin.md)).

## 1. Ce que le développeur écrit, fichier par fichier

### `src/schema.ts` (245 lignes, 7 imports, 6 paquets)

Une fabrique de schémas configurée, distincte de l'application (l. 13-17) :

```ts
const TodoSchemaApplication = UltimaBase.use(accessPlugin())
	.use(hooksPlugin())
	.use(validationPlugin())
	.use(rolesPlugin())
	.use(aclPlugin())
```

Un nom de classe en chaîne qui répète l'export, et des cibles de relation en
chaîne (l. 20-33) :

```ts
export const TodoUser = TodoSchemaApplication.Schema.define({
	className: 'TodoUser',
	// ...
		assignedTodos: field.relation({
			mappedBy: 'assignee',
			target: 'Todo',
```

L'autre côté de la relation, dans `Todo` (l. 213-220) :
`assignee: field.pointer({ access: { write: false }, onDelete: 'setNull', target: 'TodoUser' })`.

Un schéma de rôles par une forme spéciale (l. 40-43) :
`RoleSchema.define(TodoSchemaApplication.Schema, { className: 'TodoRole', members: { schema: TodoUser }, deletion: { references: 'fail' }, ...`
puis une référence de rôle (l. 60) : `TodoRole.role('editor')`.

Access partagé par deux schémas, construit avec un utilitaire (l. 9-12) :
`{ read: true, ...allMutations(false) }`. Access de `Todo` (l. 223-229) :
`read: { where: ({ where }) => where.eq('archived', false) }`, puis
`create: false, update: true, upsert: false, delete: false`.

ACL par défaut (l. 230-234) :
`default: new ACL().grantPublic('read').grantRole(TodoEditorRole, 'read', 'update')`.

Hook de schéma (l. 235-243) :
`beforeOperation: { update: ({ item, originalItem }) => { ... throw new TypeError(...) } }`.

Hooks de champ dont la forme dépend de `required` : `value.trim()` (l. 25,
68, champs requis) contre `value?.trim() ?? null` (l. 47, 81).

Options PostgreSQL sur schéma et champ : `postgres: { table: 'todos' }`
(l. 244), `postgres: { renamedFrom: 'summary' }` (l. 69) ; 5 occurrences.

Enum et objets nommés par `typeName` ; `TodoPriority` écrit deux fois avec les
mêmes `values` (l. 150-156 et 200-204). Validation Zod par champ :
`validation: z.string().max(200)` (l. 71),
`z.custom<Uint8Array>((value) => value instanceof Uint8Array)` (l. 142).

### `src/create-application.ts` (52 lignes, 10 imports, 9 modules)

Chemin du fichier généré calculé à la main (l. 14-16) :
`fileURLToPath(new URL('../.ultimabase/schema.generated.d.ts', import.meta.url))`.

Une interface d'options écrite par le développeur (l. 19-22) :
`databaseUrl: string`, `generatedTypesPath?: string`.

Liste des schémas et liste des plugins figées par `as const` (l. 25, 46) ;
la liste reprend les 5 plugins de `schema.ts` avec une autre option pour
Access, plus `typegenPlugin` et `postgresPlugin` (l. 33-45) :

```ts
accessPlugin({ default: true }),
// ...
typegenPlugin({ applicationId: 'todo-backend', outputPath: generatedTypesPath }),
postgresPlugin({ schemaPolicy: 'override', url: databaseUrl }),
```

Construction (l. 50-51) :
`const Application = UltimaBase.use(...createTodoPlugins(options))` puis
`new Application({ schemas: todoSchemas })`. `createTodoPlugins` et
`todoSchemas` sont exportés « pour les vérifications Typegen autonomes »
(commentaire l. 24) mais `git grep` ne leur trouve aucun consommateur hors de
ce fichier (le test e2e de Typegen importe `src/schema.js` directement).

### `src/application.ts` (10 lignes)

Lecture et contrôle manuels de l'environnement (l. 3-7) :
`const databaseUrl = process.env.DATABASE_URL` puis
`throw new TypeError('DATABASE_URL is required to start the Todo backend')`.
Instance exportée (l. 10) : `createTodoApplication({ databaseUrl })`.

### `src/main.ts` (15 lignes)

`await ultimabase.start()` (l. 3), message de démarrage, fonction `shutdown`
appelant `ultimabase.dispose()` (l. 9-11), deux gestionnaires
`process.once('SIGINT' | 'SIGTERM', () => void shutdown())` (l. 14-15).

### `src/todos.ts` (56 lignes)

Type d'entrée importé du fichier généré, avec extension `.js` alors que les
sources s'importent en `.ts` (l. 2) :
`import type { TodoNestedCreateInput } from '../.ultimabase/schema.generated.js'`.
Méthodes statiques de la classe de schéma, Master en second argument (l. 6-17) :
`Todo.createOne({ data, select: { ... } }, { useMasterKey: true })`.
Requête (l. 22-34) : `Todo.findMany({ include: { assignee: { select: { displayName: true } } }, orderBy: { dueAt: 'asc', createdAt: 'asc' }, select: {...}, where: { completed: { eq: false } } })`.
Mise à jour et suppression par identifiant : `where: { id: { eq: id } }`
(l. 43, 53).

### `src/admin.ts` (60 lignes)

Master factorisé (l. 4) : `const masterOptions = { useMasterKey: true } as const`.
Type du rôle persisté reconstruit par inférence, trois fois (l. 18, 26, 27) :
`role: Awaited<ReturnType<typeof createTodoRole>>`.
Création d'un rôle par instance puis commande (l. 14) :
`new TodoRole({ description, name }).create({}, masterOptions)`.
Pointeur : `TodoUser.pointer(userId)` (l. 21, 50). ACL immuable relue puis
réécrite (l. 34-58) : `findOne` + `updateOne({ data: { acl: todo.acl.grantPrincipal(...) } })`.

### `package.json`, `tsconfig.json`, `.ultimabase/schema.generated.d.ts`

- `package.json` : 9 dépendances dont `@ultimabase/typegen` et `zod`
  (l. 10-20) ; scripts `start: node src/main.ts`, `typecheck: tsc --noEmit`.
- `tsconfig.json` : `allowImportingTsExtensions: true` (l. 4) et inclusion
  explicite `".ultimabase/**/*.d.ts"` (l. 12).
- Fichier généré, versionné : 1 535 lignes, 59 598 octets, 102 types
  exportés pour 3 schémas, 4 imports de types de plugins (l. 6-22),
  `namespace Schemas` (l. 1441-1513) et augmentation de `@ultimabase/core`
  (l. 1516-1535) qui ajoute `access`, `acl`, `hooks` et `postgres` aux
  options de schéma et `postgres` aux options de champ.

### `README.md` : écarts constatés avec les sources

- l. 22 : `UltimaBase.use(accessPlugin({ default: true }))` dans l'extrait de
  `schema.ts`, alors que `schema.ts:13` écrit `accessPlugin()`.
- l. 137 : `createTodo = (data: TodoCreateInput)` ; la source utilise
  `TodoNestedCreateInput` (`todos.ts:5`).
- l. 235-245 : « module augmentation now retains only the PostgreSQL
  options », contredit par `schema.generated.d.ts:1529-1531` (`access`,
  `acl`, `hooks`).
- l. 32 : `value?.trim() ?? null` sur `title`, la source écrit `value.trim()`
  (`schema.ts:68`).

## 2. Frictions

Critères : ceux de la grille du plan (SG = sans génération, Col =
colocalisation, Conc = concision, 1F = une forme par concept, RP = révélation
progressive, Err = erreurs, Hov = hovers, Perf = performance TypeScript,
JS = utilisable sans TypeScript).

| #   | Friction                                                                                                                  | Où                                                        | Pourquoi aujourd'hui                                                                                                                     | Critère   |
| --- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| F1  | Plugins déclarés deux fois : fabrique de schémas (5) et application (7)                                                   | `schema.ts:13-17`, `create-application.ts:32-46`          | Les options locales viennent de la fabrique configurée (ADR-0279, ADR-0280) ; `postgresPlugin` exige l'URL à la déclaration (core.md §3) | Conc, 1F  |
| F2  | Options divergentes entre les deux listes (`accessPlugin()` / `accessPlugin({ default: true })`), sans diagnostic         | `schema.ts:13`, `create-application.ts:33`                | `Application.Schema` ne sert qu'aux types ; seule la liste de l'application compte au Runtime (access-plugin.md §1)                      | Err, 1F   |
| F3  | Ordre des plugins choisi par le développeur dans `.use()` et dans la liste                                                | `schema.ts:13-17`, `create-application.ts:32-46`          | Tuple ordonné (ADR-0282) ; README ACL l. 157-158 : l'ordre ne change pas ACL ; effet sur les autres plugins non vérifié ici              | RP        |
| F4  | `as const` sur la liste de plugins, la liste de schémas et les options Master                                             | `create-application.ts:25,46`, `admin.ts:4`               | Un tableau ouvert perd l'inférence exacte du tuple (core.md §1)                                                                          | Conc, 1F  |
| F5  | `typegenPlugin` + `applicationId` + chemin de sortie calculé + option `generatedTypesPath`                                | `create-application.ts:9,14-16,21,38-41`                  | Graphe de noms de schémas retenu dans Typegen (ADR-0280, 0281, 0283)                                                                     | SG        |
| F6  | Fichier généré de 1 535 lignes versionné, inclus dans `tsconfig`, régénéré seulement par `start()` (donc avec PostgreSQL) | `tsconfig.json:12`, `schema.generated.d.ts`, `README:262` | Même raison ; pas de CLI ni de mode `--check` (typegen.md §1)                                                                            | SG, Perf  |
| F7  | Types d'entrée importés depuis le fichier généré, chemin relatif `../.ultimabase/…js`                                     | `todos.ts:2`, `admin.ts:2`                                | Aucun type nommé exporté par la source pour `CreateInput` (typegen.md §2)                                                                | SG, 1F    |
| F8  | `className` en chaîne qui répète le nom de l'export (3 fois)                                                              | `schema.ts:21,41,64`                                      | Le nom de classe est la clé du registre généré (`UltimaBaseGeneratedSchemas`, généré l. 1520-1523)                                       | Conc, SG  |
| F9  | Cibles de relation en chaîne, typos non détectées sans fichier généré                                                     | `schema.ts:32,219`                                        | Références circulaires résolues par nom (plan, problème 1 ; core.md §3 : 0/3 typos détectées)                                            | SG, Err   |
| F10 | Une relation déclarée des deux côtés : `pointer` + `relation` avec `mappedBy` en chaîne                                   | `schema.ts:29-33`, `:213-220`                             | Relation inverse explicite dans Core (`packages/core/docs/schema.md:150-300`)                                                            | Col, Conc |
| F11 | `typeName` en chaîne pour enums et objets ; enum `TodoPriority` réécrit pour être partagé                                 | `schema.ts:153,174,180,183,202,211`                       | Nom de type émis par Typegen (généré l. 24, 35, 46) ; pas de valeur d'enum réutilisable dans l'exemple                                   | 1F, Conc  |
| F12 | Schéma de rôles par `RoleSchema.define(TodoSchemaApplication.Schema, {...})`, pas `Schema.define`                         | `schema.ts:40`                                            | Spécialisation de paquet (ADR-0284, même forme que Password Auth)                                                                        | 1F        |
| F13 | `grantRole(TodoEditorRole, …)` déclaré mais inopérant hors Master (pas de `resolveCurrent`), sans avertissement           | `schema.ts:60,230-234`                                    | Appartenance résolue par `members.resolveCurrent` (roles-plugin.md §1)                                                                   | Err       |
| F14 | Access écrit opération par opération, avec utilitaire `allMutations` et littéral partagé                                  | `schema.ts:9-12,35,55,223-229`                            | Refus par défaut ; granularité par opération (access-plugin.md) ; ADR-0293 retire `default: true` des exemples                           | RP, Conc  |
| F15 | `access`, `acl`, `hooks` de schéma typés seulement par l'augmentation générée                                             | `schema.ts:223-243`, généré l. 1529-1531                  | Callbacks qui voient le schéma complet (ADR-0280, ADR-0283) ; sans fichier : TS2345 `never` sur tout l'objet (core.md §3)                | SG, Err   |
| F16 | Options `postgres` (5) typées par augmentation générée : `postgresPlugin` absent de la fabrique de schémas                | `schema.ts:26,36,56,69,244`, généré l. 1526, 1532         | Conséquence de F1 : l'URL empêche de mettre `postgresPlugin` dans `TodoSchemaApplication` (core.md §3)                                   | SG, Col   |
| F17 | Forme du hook de champ dépendante de `required` (`value.trim()` / `value?.trim() ?? null`)                                | `schema.ts:25,47,68,81`                                   | `value` nullable quand le champ n'est pas requis (hooks-plugin.md)                                                                       | RP        |
| F18 | `{ useMasterKey: true }` en dernier argument de 9 appels                                                                  | `todos.ts:17,45,55`, `admin.ts:8,14,21,29,39,58`          | Autorité choisie par commande, hors AST (`packages/core/docs/runtime.md:46`) ; aucune `MasterAuthority` configurée dans l'exemple        | Conc      |
| F19 | Accès par identifiant écrit `where: { id: { eq: id } }` (4 fois)                                                          | `todos.ts:43,53`, `admin.ts:37,56`                        | Une seule forme `where` pour toutes les requêtes ; pas de raccourci par id dans l'exemple                                                | Conc      |
| F20 | Type du rôle persisté reconstruit : `Awaited<ReturnType<typeof createTodoRole>>` (3 fois)                                 | `admin.ts:18,26,27`                                       | Aucun nom de type public utilisé par l'exemple pour un modèle persisté (non vérifié s'il en existe un)                                   | Conc, Hov |
| F21 | Deux formes de pointeur : `TodoUser.pointer(id)` ici, `{ connect }` dans `updateOne`                                      | `admin.ts:21,50`                                          | core.md §3 (« Deux formes pour un pointeur »)                                                                                            | 1F        |
| F22 | Lecture et contrôle manuels de `DATABASE_URL` ; `schemaPolicy: 'override'` explicite                                      | `application.ts:3-7`, `create-application.ts:43`          | Core ne lit pas l'environnement ; ADR-0292 (défaut selon `NODE_ENV`) acceptée, implémentation prévue avec la migration                   | RP, Conc  |
| F23 | Trois fichiers et une interface d'options pour construire et lancer l'application ; démarrage et arrêt écrits à la main   | `create-application.ts`, `application.ts`, `main.ts:3-15` | Séparation construction / ressources (« without starting resources », l. 27) ; cycle de vie `start`/`dispose` explicite                  | Conc, RP  |
| F24 | Imports `.ts` pour les sources, `.js` pour le fichier généré ; `allowImportingTsExtensions` requis                        | `create-application.ts:12`, `todos.ts:2`, `tsconfig:4`    | `node src/main.ts` exécute le TypeScript directement (Node ≥ 24, `package.json` racine)                                                  | 1F        |
| F25 | README dont les extraits divergent des sources (voir §1)                                                                  | `README.md:22,32,137,235-245`                             | Extraits recopiés à la main (piste « inclure le code des exemples » du plan)                                                             | — (doc)   |

## 3. Chiffres

| Fichier                     | Lignes | Sans blancs ni commentaires (approx.) | Imports | Annotations / casts écrits                                                    |
| --------------------------- | ------ | ------------------------------------- | ------- | ----------------------------------------------------------------------------- |
| `src/schema.ts`             | 245    | 236                                   | 7       | 1 (`z.custom<Uint8Array>`)                                                    |
| `src/create-application.ts` | 52     | 41                                    | 10      | 2 `as const`, 1 interface (2 champs), 2 paramètres annotés                    |
| `src/application.ts`        | 10     | 6                                     | 1       | 0                                                                             |
| `src/main.ts`               | 15     | 10                                    | 1       | 1 (`Promise<void>`)                                                           |
| `src/todos.ts`              | 56     | 48                                    | 2       | 3 paramètres annotés, dont 1 type généré                                      |
| `src/admin.ts`              | 60     | 47                                    | 2       | 1 `as const`, 11 annotations dont 3 `Awaited<ReturnType<…>>` et 1 type généré |
| **Total `src/`**            | 438    | 388                                   | 23      | 3 `as const`, ~19 annotations, 0 cast `as T`                                  |

- Modules importés distincts : 9 paquets npm (8 `@ultimabase/*` + `zod`),
  `node:url`, 3 modules locaux et le fichier généré. Symboles de framework
  importés : 11 (`UltimaBase`, 7 fabriques de plugins, `ACL`, `allMutations`,
  `RoleSchema`) plus 2 types générés.
- `schema.ts` : 57 appels `field.*`, 27 `description`, 3 `className`,
  2 `target`, 6 `typeName`, 5 `postgres`, 5 `access`, 5 `hooks`.
- Fichier généré : 1 535 lignes / 59 598 octets pour 438 lignes de source
  (≈ 3,5 fois) et 3 schémas ; 102 types exportés.
- Master : 9 appels avec `useMasterKey`, sur 10 appels de données au total
  (seul `listPendingTodos` s'en passe).
- Étapes pour lancer (README l. 253-268) : 1. `corepack yarn build` (tout le
  dépôt) ; 2. fournir une base PostgreSQL ; 3. `DATABASE_URL=… corepack yarn
workspace @ultimabase/example-todo-backend start` (génère le `.d.ts` puis
  se connecte) ; 4. `… typecheck`. Le typecheck n'est exact qu'après l'étape 3
  si le graphe de schémas a changé.

## 4. Questions pour demain

1. **Une seule déclaration des plugins ?** Comment le développeur déclare-t-il
   ses plugins une fois, alors qu'un plugin d'infrastructure a besoin d'une
   valeur d'environnement (URL) et que les schémas ont besoin des types des
   plugins ? Le fichier `ultimabase.config.ts` doit rester possible sans
   cycle. (F1, F2, F16, F22)
2. **Quel est le nom d'un schéma ?** L'export, `className`, ou les deux ? Que
   devient la clé de registre si `className` disparaît, et comment
   s'expriment les cibles en cycle entre fichiers sans chaîne ? (F8, F9)
3. **Une relation, une ou deux déclarations ?** Le pointeur et sa relation
   inverse doivent-ils s'écrire des deux côtés, et sous quelle forme pour
   rester colocalisés et vérifiés sans génération ? (F9, F10)
4. **Comment `access`, `acl` et `hooks` de schéma voient-ils le schéma
   complet sans fichier généré ?** Déclaration unique, deux temps, ou autre ;
   et l'erreur doit tomber sur la ligne fautive. (F15, F13)
5. **D'où viennent les types nommés que le code applicatif importe**
   (`TodoNestedCreateInput`, modèle persisté) ? Exportés par le schéma, dérivés
   par un utilitaire, ou inutiles ? (F7, F20)
6. **Où vit l'autorité Master dans le code serveur ?** Option par commande,
   portée (`app.master…`), ou autre, sachant que 9 appels sur 10 l'utilisent
   ici et que Master doit rester infalsifiable. (F18)
7. **Une forme ou des cas spéciaux ?** `RoleSchema.define(App.Schema, …)`,
   `typeName` en chaîne, enum répété, `TodoUser.pointer(id)` contre
   `{ connect }`, `where: { id: { eq } }` : lesquels deviennent la forme
   générale ? (F11, F12, F19, F21)
8. **Quel est le cas courant sans option ?** Access par défaut (ADR-0293),
   `schemaPolicy` (ADR-0292), `resolveCurrent` des rôles, forme des hooks de
   champ nullable : qu'écrit le développeur qui ne configure rien ? (F13, F14,
   F17, F22)
9. **Combien de fichiers pour démarrer ?** Construction, instance,
   environnement, démarrage, arrêt sur signaux : que garde le développeur et
   que prend en charge le framework ou le CLI ? (F23, F22, F6)
10. **Comment garder exemples et documentation alignés ?** Le README diverge
    déjà des sources sur 4 points. (F25)

## Limites de cette photographie

- Lignes « sans blancs ni commentaires » : filtre grossier
  (`grep -vE '^\s*$|^\s*(//|/\*\*|\*)'`), à ±2 lignes par fichier.
- Rien n'a été compilé ni exécuté pour ce document (machine occupée) ; les
  diagnostics sans fichier généré cités viennent de
  [core.md §3](api-inventory/core.md).
- F3 (effet de l'ordre des plugins hors ACL) et F20 (existence d'un type
  public du modèle persisté) ne sont pas vérifiés.
