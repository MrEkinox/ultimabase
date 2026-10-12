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

En cours. Fait :

- Core : `databaseResetCapability` (neutre, durée de vie `application`,
  exportée par `@ultimabase/core` comme les autres capacités de base de
  données) ; `openApplicationHarness(ultimabase)` dans
  `@ultimabase/core/plugin` (`master(options)`, `resetDatabase()`), autorité
  sans clé propre au harnais acceptée par `bindRequestContextToApplication`.
- PostgreSQL : fournisseur `database-reset` (`TRUNCATE` de toutes les tables
  du catalogue, liaisons et stockage privé compris, `RESTART IDENTITY`, sans
  `CASCADE`).
- Testing : `testApplication`, `ultimabaseTesting()` (global setup, fichier
  de setup `afterAll`), entrée `/plugins` ; imports du dépôt déplacés.

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
6. **Reset** : supprime aussi les lignes créées au démarrage par des plugins
   (`ensure` de Roles) ; documenté.

## Observé hors portée

- Un champ `field.int({ autoIncrement: true })` fait échouer `createOne`
  (`field.required` sur ce champ, validation finale de mutation), avec ou
  sans Hooks ; code de validation non touché par cette branche.

## Prochaine action vérifiable

Point de contrôle testing, puis create-app et exemples.
