# Migration, sous-étape 6.7 : `testApplication`, starter create-app, exemples en forme D (ADR-0327)

Branche `migration/testing-starter` (worktree `../ub-step6-7`), basée sur
`main` local 5e719ea2 (fusion de 6.4b).

## Portée

ADR-0327, décisions 1 à 10 et conséquences :

1. `testApplication(ultimabase)` : application de production sur un schéma
   isolé par worker, `TEST_DATABASE_URL` ou PostgreSQL Testcontainers lancé
   une fois, `await using`.
2. `t.reset()` (capacité d'adaptateur neutre, `TRUNCATE` pour PostgreSQL),
   `t.fetch`, `t.as`, `t.asMaster`, `t.afterCommit()`.
3. `@ultimabase/testing/vitest` : `ultimabaseTesting()` ; `readVitestPoolId`
   quitte l'API publique.
4. `@ultimabase/testing/plugins` pour la conformance ;
   `withPluginTypegenConformance` reste jusqu'à 6.8.
5. à 9. create-app : scripts `dev` et `test`, REST par défaut, ouverture
   prototype `allowWithoutRule: { all: 'development' }`, `tests/task.test.ts`,
   Docker Compose par défaut avec détection, Prettier et ESLint des projets
   générés.
6. Forme D partout : gabarits, `examples/todo-backend`, `examples/minimal`,
   retrait des `.with({})` qui n'évitaient que le cycle de `Register`.

Critère de fin : porte complète sur le dernier commit de code
(`yarn validate:full`, `yarn test:e2e:built`, `yarn website:test`), audit DX
expliqué contre une base 5e719ea2 construite.

## État

Implémentation, tests, documentation, porte et audit DX faits. Dernier commit
de code : 04ef7c2b. Rien n'est poussé ni fusionné.

- Core : `databaseResetCapability` (neutre, durée de vie `application`,
  exportée par `@ultimabase/core` comme les autres capacités de base de
  données) ; `openApplicationHarness(ultimabase)` dans
  `@ultimabase/core/plugin` (`master(options)`, `resetDatabase()`), autorité
  sans clé propre au harnais acceptée par `bindRequestContextToApplication` ;
  `resetDatabase()` relance la phase `ready` des plugins
  (`LifecycleManager.seed()`, `FrameworkApplication.seed()` interne).
- PostgreSQL : fournisseur `database-reset` (`synchronization/reset.ts` :
  `TRUNCATE` de toutes les tables du catalogue, liaisons et stockage privé
  compris, `RESTART IDENTITY`, sans `CASCADE`).
- Testing : `testApplication`, `ultimabaseTesting()` (global setup, fichier
  de setup `afterAll`), entrées `/plugins` et `/vitest` ; imports du dépôt
  déplacés vers `/plugins` ; dépendances `pg`, `@testcontainers/postgresql`,
  pair facultatif `vitest`.
- Hooks : les clés de commandes de plugin (`purgeOne`, `restoreOne`…) sont
  lues dans le schéma enregistré (`SchemaRulesSource`, comme Access) ; sans
  cela, une application nommée dans `Register` ne pouvait pas écrire de Hook
  de commande dans `.with` (trouvé en passant minimal en forme D).
- Exemples : todo-backend (forme D, `apiServer({ rest: true })`, Master par
  `ULTIMABASE_MASTER_KEY`, `ensure: ['editor']`, `dev`, `test` et quatre
  tests avec `testApplication`) ; minimal (forme D, `Register` réel, plus de
  Typegen ni de fichiers générés).
- create-app : forme D, scripts `dev`/`test`, REST et Access par défaut,
  ouverture prototype, `tests/task.test.*`, `vitest.config.*`,
  `tsconfig.json` + `tsconfig.build.json`, Docker par défaut avec détection
  (`docker.ts`) et repli, `--database-url`, `--api none`/`--plugin none`,
  test Prettier + ESLint des projets générés (132 cas).
- Documentation : README de testing, de create-app, des exemples ; guide de
  test ; démarrage rapide ; pages qui importaient les outils déplacés ;
  `ARCHITECTURE.md`.

## Décisions prises (non fixées par l'ADR, à confirmer)

1. **Injection réservée aux tests** : Core expose
   `openApplicationHarness(ultimabase)` (entrée plugin). Il ne s'ouvre que
   sur une application pas encore démarrée, une seule fois ; les pouvoirs
   (Master sans clé, remise à zéro) n'existent que sur l'objet rendu. Une
   application démarrée normalement (`ultimabase.start()` en production) ne
   peut jamais en obtenir un ; aucune option, variable d'environnement ni
   entrée de transport ne l'ouvre ; chaque élévation est journalisée en
   `debug` (« Harness elevated to Master ») ; `testApplication` refuse en
   plus `NODE_ENV=production`. `t.as(principal, fn)` utilise
   `RequestContext.withPrincipal` (API serveur existante d'ADR-0304) ; il ne
   s'applique qu'aux appels directs dans `fn`, pas à `t.fetch` : une requête
   HTTP s'authentifie comme un client (en-têtes).
2. **Réutilisation dans un fichier** : une application ne redémarre pas après
   `dispose()`. `testApplication(app)` démarre l'application au premier appel
   puis, pour la même application, la réutilise après `reset()` : chaque test
   écrit `await using t = await testApplication(ultimabase)` et part de tables
   vides. Quitter la portée attend le travail après commit et ferme le
   handle ; l'application s'arrête à la fin du fichier (`afterAll` du fichier
   de setup de `ultimabaseTesting()`) et son schéma est supprimé. Sans
   Vitest, `await ultimabase.dispose()` l'arrête (le schéma est recréé au
   prochain lancement).
3. **Isolation** : schéma `ultimabase_test_<VITEST_POOL_ID>` (`JEST_WORKER_ID`,
   sinon 1), `DATABASE_URL` posé le temps de `start()` avec
   `options=-c search_path=…` et `application_name` ; après le démarrage,
   `testApplication` vérifie qu'une connexion porte ce nom, sinon il refuse
   (une application qui passe `url` ou `pool` à `postgresPlugin` n'est jamais
   vidée par erreur).
4. **`ultimabaseTesting()`** rend `globalSetup`, `setupFiles`,
   `env: { PORT: '0' }` (un serveur Hono écoute sur un port libre, les
   workers ne se disputent pas 1337), `testTimeout` et `hookTimeout` à 30 s.
5. **Entrées** : la racine n'exporte que `testApplication` (et son type) ;
   `/plugins` reçoit la conformance, `FakePublicOperationTransport`,
   `PostgresTestWorker`, `waitForAfterCommit` et `createCapturingLogger`
   (outils des tests qui construisent leur application) ; `readVitestPoolId`
   reste interne.
6. **Reset** : vide les tables puis relance la phase `ready` (amorçage, où
   Roles crée ses rôles `ensure`) : les données sont celles d'un démarrage.
   Les hooks `ready` doivent rester idempotents (contrat déjà écrit dans
   `PluginApplicationLifecycle`).
7. **create-app, Access** : Access sélectionné (par défaut ou non) s'installe
   toujours avec l'ouverture prototype, et la Task n'a plus de règle. Le
   message de refus en production est celui d'Access (« … which production
   refuses (NODE_ENV is production). Write schema rules, or use true … ») ;
   le commentaire généré et le README disent d'écrire les règles puis de
   retirer l'ouverture. Avec Access, REST et GraphQL exposent les écritures ;
   sans Access, ils restent en lecture seule. Le User (authentification +
   Access) reçoit des règles explicites (`read` propre profil, écritures à
   `false`), sans quoi l'ouverture prototype ouvrirait ses écritures.
8. **create-app, clé Master** : seuls ACL et Roles l'exigent désormais
   (Access prototype n'en a plus besoin pour l'amorçage). Elle est générée
   dès que `.env` est écrit (Docker ou URL fournie).
9. **create-app, défauts** : `--yes` et les questions choisissent REST et
   Access ; `--api none` et `--plugin none` permettent de ne rien choisir
   sans terminal. `resolveSelection` (API programmatique) garde ses défauts
   vides : seul le parcours de questions applique ceux de l'ADR.
10. **create-app, base** : Docker par défaut si `docker compose version`
    répond en 5 s ; sinon avis « Docker was not found… » et base existante ;
    la question suivante propose une URL (vide = plus tard), écrite dans
    `.env` ; `--database-url` pour les drapeaux.
11. **create-app, TypeScript** : `tsconfig.json` sans émission (src, tests,
    `vitest.config.ts`) avec `rewriteRelativeImportExtensions`,
    `verbatimModuleSyntax`, `erasableSyntaxOnly` ; `tsconfig.build.json`
    émet `src` vers `dist`. Imports relatifs en `.ts`. Scripts : `dev`,
    `build`, `start` (dist), `typecheck` (`tsc`), `test` ; JavaScript : `dev`,
    `start`, `test` ; starter vide : `vitest run --passWithNoTests`.
12. **create-app, style** : vérifié avec Prettier (`semi: false`,
    `singleQuote: true`) et les règles recommandées d'ESLint et
    typescript-eslint sans information de type ; aucun fichier de
    configuration Prettier ou ESLint n'est généré.
13. **Exemple todo-backend** : devient l'application de référence avec REST
    (`apiServer`), une autorité Master (ses fonctions d'administration
    utilisaient `useMasterKey` sans autorité configurée) et `ensure:
['editor']` (son ACL par défaut accorde ce rôle : sans lui, aucune tâche
    ne pouvait être créée).
14. **Exemple minimal** : garde ses plugins HTTP un par un (ses tests
    injectent serveur et réglages HTTP par instance) ; `apiServer` n'y est
    pas utilisé.
15. **Entrées de testing** : `withPluginTypegenConformance` reste dans
    `/plugins`, marqué TEMPORAIRE jusqu'à 6.8.

## Correctif hors ADR (à confirmer)

- Un champ `autoIncrement` faisait échouer tout `createOne`
  (`field.required` sur ce champ) : l'instantané final de la mutation
  (`snapshotRuntimeMutationOperation`) exigeait la valeur que seule la base
  attribue. Trouvé en écrivant le test de `reset()` ; l'exemple
  todo-backend (`sequence`, `largeSequence`) ne pouvait créer aucune tâche.
  Correctif : l'instantané de création rend ces champs facultatifs
  (`runtime-validation.ts`) ; test de régression dans
  `runtime-validation.test.ts` (échoue sans le correctif), et
  `test-application.postgres.e2e.test.ts` vérifie `sequence = 1` après
  `reset()`.

## Blocage rapporté (règle d'arrêt) : filtres de relation dans les deux sens

Le callback `where` de `ExampleArticle.reviewers` cycle en forme D quand
`Register` nomme l'application (TS7023 : le type de retour inféré lit le
registre pendant que le schéma est typé). Contournement trouvé : une
constante typée par la cible différée,
`RelationWhereResolver<DeferredSchemaTarget<() => typeof ExampleAuthor>>`,
passée à `where`. En revanche, deux relations qui se filtrent l'une l'autre
(`ExampleAuthor.articles`/`contributions` filtrés sur `published` et
`ExampleArticle.contributors` filtré sur `listed`) cyclent quelle que soit la
forme : objet en ligne (TS2615), constante annotée `typeof` (TS2502),
constante annotée `SchemaRef<'…'>` (TS2502). Cause : Core type l'option
`where` contre la cible résolue pendant `define(...)`. Les filtres du côté
Author ont été retirés (la règle de lecture d'Article masque déjà les
articles non publiés aux appelants ordinaires ; les tests e2e restent
verts). Options : (a) Core type `where` par le nom (`SchemaRef`) de façon
paresseuse ; (b) filtres de relation dans `.with(...)` ; (c) accepter un seul
sens. Décision à prendre (6.8 ou ADR).

## Observé pour 6.8

- En forme D, les résolveurs de champs virtuels déclarés dans `define(...)`
  reçoivent des valeurs `unknown` (minimal les lit par
  `src/stored-values.ts`).
- Des `.with({})` restent dans des tests et des pages de documentation
  (soft-delete, hooks, password-authentication, build-a-plugin) : hors des
  gabarits et des exemples visés par la décision 10.
- Les tests d'un projet généré avec GraphQL échouent si ses paquets
  `@ultimabase/*` sont des liens symboliques vers l'espace de travail (deux
  royaumes `graphql`) ; avec des paquets installés (copie, comme le registre)
  ils passent. Le test e2e du starter installe donc des copies.

## Tests publics modifiés (ancien → nouveau)

- `packages/testing/tests/public-api.test.ts` : la racine exportait 11 noms
  (conformance, `PostgresTestWorker`, `readVitestPoolId`,
  `waitForAfterCommit`, `createCapturingLogger`…) → `['testApplication']` ;
  ajout des listes de `/plugins` (les 10 noms sans `readVitestPoolId`) et de
  `/vitest` (`ultimabaseTesting`).
- `packages/core/tests/public-api.test.ts` : + `databaseResetCapability`,
  `databaseResetCapabilityVersion` (racine), + `openApplicationHarness`
  (`/plugin`).
- `apps/website/tests/guides.content.test.ts` : `PostgresTestWorker`,
  `await worker.reset()`, `await ultimabase.dispose()`,
  `await worker.dispose()` → `await using t = await testApplication(ultimabase)`,
  `...ultimabaseTesting()`, `t.asMaster(`, absence de `readVitestPoolId`.
- `apps/website/tests/documentation-navigation.content.test.ts` :
  `PostgresTestWorker`, `Task.findOneOrThrow(` → `testApplication`,
  `t.fetch('/api/classes/Task')`.
- `apps/website/tests/reference.content.test.ts` : sous-chemins `['.']` sauf
  Core → Testing a `['.', './plugins', './vitest']`.
- `packages/testing/tests/e2e/postgres-worker-isolation.postgres.e2e.test.ts` :
  `readVitestPoolId(process.env.VITEST_POOL_ID)` →
  `Number(process.env.VITEST_POOL_ID)` (assertions inchangées).
- `packages/typegen/tests/e2e/typegen-generated-types.e2e.test.ts` : test
  « keeps the committed Todo declaration aligned with its plugin graph »
  retiré (todo-backend n'a plus de déclaration générée).
- `packages/rest-plugin/tests/e2e/rest-application.e2e.test.ts` : test
  « keeps the generated minimal REST declarations aligned » retiré (minimal
  n'a plus de déclaration générée).
- create-app e2e : `create-app-api` (Task lisible en développement avec
  Access prototype : 403 → 200, `PERMISSION_DENIED` → données) ;
  `create-app-security` (Access ne refuse plus en développement : l'ACL vide
  masque la Task) ; `create-app-packed` (`typecheck`/`build`/Typegen → `dev`,
  `@ultimabase/testing`, `vitest.config.*`, `tests/`, cas Docker absent).
- Le reste : changements de spécificateur d'import seuls
  (`@ultimabase/testing` → `@ultimabase/testing/plugins`).

## Preuves

Sur 04ef7c2b, `packages/*/dist` et `*.tsbuildinfo` hors `node_modules`
supprimés :

- `yarn validate:full` → EXIT 0 : « All matched files use Prettier code
  style! » ; lint 0 erreur (48 + 15 + 2 avertissements de taille de fichier) ;
  performance « Test Files 3 passed (3) / Tests 4 passed (4) » ; couverture
  « Test Files 743 passed (743) / Tests 3796 passed (3796) / Type Errors no
  errors », All files 92,37 / 85,73 / 96,7 / 93,08 ; site « Test Files 17
  passed (17) / Tests 66 passed (66) ». Deux exécutions précédentes avaient
  échoué : Prettier (`create-app-packed.e2e.test.ts` non formaté) puis
  `reference.content.test.ts` (sous-chemins de Testing), corrigés.
- `yarn test:e2e:built` → EXIT 0, « Test Files 140 passed (140) / Tests 613
  passed (613) » (`create-app-packed` compris, sans relance).
- `yarn website:test` → EXIT 0, « Test Files 8 passed (8) / Tests 59 passed
  (59) ».
- Projets générés (21 TypeScript, 21 JavaScript, toutes les sélections
  seules, tout, défaut, auth/ACL/Roles) : `tsc -p .` sans erreur sous
  TypeScript 6.0.3 et 7.0.2 (aucun TS7022) ; exemples minimal et
  todo-backend sans erreur sous 7.0.2.
- Unitaires ciblés pendant le travail : Hono `provider-options.test.ts`
  (arrêt borné) a échoué une fois sous charge pendant une exécution complète
  et passe seul.

### Audit DX (base 5e719ea2 construite, `--only` les 24 dossiers de paquets, `tests`, `examples/minimal`, `examples/todo-backend`)

1 315 différences (39 812 / 39 785 enregistrements), toutes lues :

| Groupe                  | Nombre | Cause                                                                                                                                                                                                                                                                                              |
| ----------------------- | -----: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `examples/minimal`      |    492 | Exemple réécrit en forme D : survols des constantes de schéma et des appels (`SourceSchemaTypeInfo<"…">` au lieu des noms générés), `Register` réel, fichiers Typegen retirés, `stored-values.ts` ajouté ; complétions aux accès de membres ; diagnostics : présence de fichiers seulement (aucun) |
| `examples/todo-backend` |    441 | Idem : forme D, `App` unique avec `apiServer`, `create-application.ts` retiré ; `CreateInput<"TodoUser">` au lieu de `TodoUserCreateInput`                                                                                                                                                         |
| `testing`               |    271 | Entrées : 28 noms passent de la racine à `/plugins` (déclarations, survols, membres re-clés), `readVitestPoolId` retiré, `testApplication`/`TestApplication` ajoutés, `/vitest` (`ultimabaseTesting`, `UltimaBaseTestingConfig`) ; source de la sonde de conformance (import `/plugins`)           |
| `core`                  |     88 | Ajouts : `databaseResetCapability`, `databaseResetCapabilityVersion`, `DatabaseResetCapability`, `openApplicationHarness`, `ApplicationHarness` (déclarations, survols, membres, 46 complétions d'exports) ; `seed()` de la classe privée `FrameworkApplication` ; noms de morceaux                |
| `hooks-plugin`          |     12 | `SchemaMutationMap` lit `SchemaRulesSource<TSchema>` : survols des types de Hooks de schéma et de leurs propriétés                                                                                                                                                                                 |
| `create-app`            |      6 | `InitializerPlan.typegen` retiré, `databaseUrl` ajouté (plan, `SelectionInput`, `ParsedOptions`)                                                                                                                                                                                                   |
| `postgres-plugin`       |      5 | Fournisseur `databaseResetCapability` dans `PostgresPluginCapabilities` (déclaration, import, trois survols du test de types `provides`)                                                                                                                                                           |

Une première exécution comptait 19 déclarations privées de plus dans
postgres-plugin (le tuple citait `ReturnType<typeof providePostgresReset>`,
ce qui tirait `PostgresSchemaCatalog` et des imports `drizzle-orm` dans les
déclarations publiées) ; corrigé par 04ef7c2b. Base supprimée ensuite.

Pas de banc : aucun type de schéma ou de requête de Core n'a changé (ajouts
d'exports seulement) ; le seul changement de typage est celui des Hooks.

## Prochaine action vérifiable

Relecture du coordinateur, décisions de l'utilisateur sur les points
ci-dessus, puis fusion `--no-ff` dans `main` ; supprimer ce handoff après la
fusion.
