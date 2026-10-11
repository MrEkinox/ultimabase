# Migration de Core, étape 4 : cycle de vie, autorité, défauts d'environnement et diagnostics (ADR-0311, ADR-0312, ADR-0313, amendement 1 d'ADR-0297)

Branche `migration/lifecycle-authority` (worktree `../ub-step4`), basée sur
`main` local 53c6ae38 (étape 3b). Plan d'ensemble :
`docs/handoff/migration-core.md` sur la branche `api-challenge`.

## Périmètre

ADR acceptés, copiés dans `docs/adr/` et inscrits dans `docs/adr/README.md`
(ADR-0058, 0066, 0094, 0153 et 0191 annotés) :

- ADR-0311 : `start()` renvoie l'application ; `ultimabase.transaction(fn)` ;
  `useMasterKey: boolean` ; sous-chemin `@ultimabase/core/plugin`
  (contexte de requête, `anonymous(app, options)`, `withContext(app, context)`,
  `authorizeMasterKey(app, rawKey)`, classes `WhereBuilder` / `QueryBuilder`),
  builders en types seulement dans l'entrée principale.
- ADR-0312 : assistant `NODE_ENV` unique dans `@ultimabase/plugin-kit` ;
  `schemaPolicy`, `DATABASE_URL` au `start()`, adresse d'écoute Hono,
  introspection Yoga, `environment` des explorateurs dérivé avec
  `allowInProduction` ; journal `debug` des valeurs dérivées.
- ADR-0313 : `new App({ logger, logLevel })`, `logger: false`, lignes préfixées
  par le paquet du plugin, `pluginPrivileges.logger` retiré ; une ligne `info`
  après `start()`, rapport des privilèges en `debug` ; avertissements `warn`
  listés ; `defineCapability({ hint })`.
- ADR-0297, amendement 1 : `Register` obligatoire (erreur de type claire),
  écrit par `create-app`.

Hors périmètre (étape 6, migration d'Access) : `allowWithoutRule`, sa valeur
`'development'` (ADR-0312) et son avertissement (ADR-0313).

## État

- [x] ADR copiés et inscrits
- [x] ADR-0311 (Core, consommateurs, tests)
- [x] ADR-0313 (journal, résumé, avertissements, indications)
- [x] ADR-0312 (plugin-kit, PostgreSQL, Hono, Yoga, explorateurs)
- [x] ADR-0297 amendement 1 (Register obligatoire, create-app, exemples)
- [x] Documentation (site, README, docs internes)
- [x] Porte finale

## Décisions (à confirmer par l'utilisateur)

ADR-0311 :

1. **`start()`** : `Promise<this>` ; les appels concurrents partagent une
   seule promesse (cache interne `StartedApplication<this>`), comme avant.
2. **`transaction(fn)`** : `fn` sans argument, type `() => T | PromiseLike<T>` ;
   fonction non valide → `TypeError` synchrone « UltimaBase transaction
   callback must be a function » ; non démarrée → l'erreur existante « must be
   started » ; imbriquée → `TRANSACTION_ERROR` existant (rejet de la promesse
   englobante, transaction externe annulée).
3. **`useMasterKey`** : message « operation useMasterKey must be a boolean when
   present ». La JSDoc garde les phrases existantes (« trusted backend code
   only », « Transport input ») et ajoute l'exemple `isScheduledJob`.
4. **Sous-chemin** : outre les noms listés, les types compagnons y passent
   aussi et quittent l'entrée principale : `RequestContextOptions`,
   `RequestMetadata`, `BuiltInRequestSource`, `RequestTransactionHandler`,
   `RequestContextValueType`, `RequestContextValueSnapshot`. Les fonctions
   `anonymous` / `withContext` / `authorizeMasterKey` sont dans
   `runtime/application/plugin-authority.ts` (lecture privée du moteur démarré
   par `readStartedUltimaBaseEngine`). `getCurrentRequest`, `getCurrentEngine`,
   `runWithRequestEngine`, `getRequestPrincipal`… restent dans l'entrée
   principale (« further names move only through their own records »).
5. **Tests de cœur** : les imports internes des barils (`../index.js`,
   `access/index.js`, `runtime/index.js`, `query/index.js`) des noms déplacés
   passent par `src/plugin.js` (tests seulement).

ADR-0313 :

6. **Types publics** : `Logger` (méthodes `debug/info/warn/error(message,
details?)`) et `LogLevel`, exportés par l'entrée principale ;
   `PluginStartContext { logger }` passé aux phases `connect`,
   `prepareSchema`, `startRuntime`, `startTransports` ;
   `PluginSetupContext.logger` ; `ApplicationCapabilityFactoryContext.logger`
   (les fabriques de capacités tournent pendant `start()`/`initialize()` :
   GraphQL et Hooks en ont besoin pour leurs erreurs masquées).
7. **Format** : lignes de Core sans préfixe entre crochets, commençant par
   « UltimaBase » (« UltimaBase started: … », « UltimaBase plugin privilege
   report », « UltimaBase: … ») ; lignes de plugin préfixées
   `[<pluginId>] ` (avec « (instance x) » si instance). Le rapport complet est
   le `details` de la ligne `debug`. Le logger est lu à chaque ligne
   (espions installés après coup respectés) ; un logger qui lève ou rejette
   n'interrompt rien.
8. **Résumé** : « UltimaBase started: N schema(s), M plugin(s) (a, b);
   critical privileges: p (a, b). Use logLevel 'debug' for the privilege
   report. » ; sans privilège critique « no critical privileges » ; sans
   plugin « 0 plugins » sans parenthèses. Les revendications d'environnement
   critiques n'y figurent pas (seulement les privilèges).
9. **Avertissements** : Core « public transport X exposes operations … »
   (une ligne, sans nom de plugin, la correction comprise) ; REST « exposes
   no schema or operation » et « has routes but no HTTP plugin » ; HTTP « has
   N routes but no server plugin ». Pour HTTP, nouvelle capacité publique
   `httpServerCapability` / `HttpServerDescriptor` (`ultimabase.http.server`,
   multiple) fournie par Hono et lue par `httpPlugin()` en phase `setup` ;
   REST lit `httpApplicationCapability` en option (phase `setup`). GraphQL
   « n'expose rien » échouait déjà au démarrage
   (`GraphqlSchemaCompilationError`) : pas d'avertissement ajouté.
10. **Journaux migrés** : erreurs masquées REST/GraphQL, `PublicError`
    après commit (Core et Hooks), rejeux (ADR-0300), santé, opérateur
    protégé non déclaré. Core lit le journal de l'application active
    (`readApplicationLog`), à défaut la console au niveau `info`.
11. **Indications** : `hint` validé (chaîne non vide, une ligne, ≤ 200) ;
    jetons de Core : adaptateur de base, principal, rôles (neutres) ;
    plugins : HTTP (application, politique navigateur), GraphQL
    (application), `graphql-http` (point d'accès), introspection.
    « Authentication » : Password Auth ne possède aucun jeton (le résolveur
    de principal est celui de Core).
12. **Testing** : `createCapturingLogger()` exporté par `@ultimabase/testing`.

ADR-0312 :

13. **Assistant** : `readDeploymentEnvironment()`, `deriveEnvironmentDefault
(explicit, { development, production })` → `{ value, source }`,
    `describeEnvironmentSource(source)` (« explicit option », « NODE_ENV is
    production », « NODE_ENV is not production »), types
    `DeploymentEnvironment`, `EnvironmentDefault`, `EnvironmentDefaults`.
14. **PostgreSQL** : `postgresPlugin(options = {})`, au plus une de `url`/`pool`
    (« accepts at most one of url or pool ») ; `DATABASE_URL` lu à la
    matérialisation de la connexion (pendant `start()`/`initialize()`) ;
    message « PostgreSQL has no connection: set the DATABASE_URL environment
    variable, or pass postgresPlugin({ url }) or postgresPlugin({ pool }). »
    (vide ou blanc compris) ; lignes `debug` « connection from … » et
    « schemaPolicy … (source) ».
15. **Hono** : production → `host` indéfini (toutes interfaces, défaut de
    Node) ; `HOST` vide ignoré ; lignes `debug` de l'hôte et du port avec leur
    source.
16. **Yoga / explorateurs** : la liaison « introspection disponible » est une
    capacité séparée `graphqlIntrospectionCapability`
    (`ultimabase.graphql.introspection`, avec indication) dans
    `@ultimabase/graphql-http`, fournie par Yoga seulement si l'introspection
    est active et exigée par un explorateur servi : refus dès `new App()` par
    `PLUGIN_CAPABILITY_MISSING`. Les deux plugins d'explorateur restent
    séparés (fusion = étape 6). Fabrique sans argument `graphiqlPlugin()`.
17. **create-app** : une seule liste de plugins dans `schema.ts` sauf les
    plugins dépendant des schémas (politique de profil, Password Auth) ;
    `postgresPlugin()` ; plus d'expression `NODE_ENV` ; `honoServerPlugin()` ;
    `main` : `await using app = await ultimabase.start()` ; scripts
    `generate:types` / `typecheck` / `build` sans `--env-file` quand aucune
    clé Master n'est nécessaire (la clé est lue à l'import).

ADR-0297, amendement 1 :

18. **Vérification** : `RegisterDeclarationCheck<TSchemas>` ajouté aux options
    de `new App()` et de `new UltimaBase()` : lit seulement `keyof Register`
    (pas de cycle) ; message « Declare the application in Register: declare
    module '@ultimabase/core' { interface Register { readonly app: typeof
    ultimabase } } ». Comme les autres vérifications d'enregistrement, un
    tableau ouvert (code générique) n'est pas vérifié.
19. **Programme de test** : `tests/fixtures/register.d.ts` déclare une
    application sans schéma (`UltimaBase<readonly []>`, source et dist) :
    types structurels inchangés pour les centaines d'applications de test ;
    ajouté aux `tsconfig.test.json` et proposé aux fixtures de service de
    langage (`createLanguageService(…, { register: true })`).
20. **Configuration** : les `tsconfig.json` de paquets excluent désormais
    `*.test.ts`, `*.test-d.ts` et `*.test-support.ts` (comme Core) ; ces
    fichiers restent vérifiés par `tooling/tsconfig/test.json` (inclusion des
    `*.test-support.ts` ajoutée) et lintés avec lui (`eslint.config.ts`).
21. **Testing** : un seul transtypage (`as unknown as`) dans
    `packages/testing/src/plugins/runner.ts` : la conformance construit des
    applications génériques hors de tout programme d'application.
22. **Archive Core** : `core-archive-declarations.e2e.test.ts` sonde ses
    fixtures à un emplacement de consommateur (`tests/e2e/core-archive-
consumer/`, virtuel) : dans `packages/core`, `@ultimabase/core/plugin` se
    résout par auto-référence du paquet alors que les déclarations des
    plugins passent par `node_modules`, et TypeScript tient alors deux copies
    des classes de Core (inférence de `new QueryBuilder(PostSchema)` perdue).

## Reports et conflits

- `allowWithoutRule` (valeur `'development'`, refus en production,
  avertissement) et le récapitulatif `info` des schémas sans règle Access
  (access.md décision 9) : étape 6 (migration d'Access).
- **Conflit Register / forme ancienne** : `readonly app: typeof ultimabase`
  crée un cycle (TS7022 / TS2502) dès qu'un schéma de forme ancienne lit le
  registre pendant son typage : `RoleSchema.define(…)` (create-app avec
  Roles, exemples `minimal` et `todo-backend`) et les schémas à règles
  Access dans `define` (fixtures du site). Contournement appliqué :
  `readonly app: UltimaBase<readonly []>` (enregistrement sans schéma ; Typegen
  fournit déjà les types nommés). create-app écrit `typeof ultimabase` sauf
  avec Roles. Options : (a) garder ce contournement jusqu'aux fabriques
  `App.RoleSchema` (étape 6, amendement 3) ; (b) faire écrire la ligne par
  Typegen ; (c) migrer exemples et create-app vers la forme D.
- Dérivation `debug` de Yoga et des explorateurs non testée directement
  (PostgreSQL et Hono le sont).

## Tentatives écartées

- Introspection portée par `GraphqlHttpEndpoint` (champ `introspection`) :
  écartée pour une capacité séparée (revue Yoga décision 2, indication
  ADR-0313), qui ne change pas le contrat existant du point d'accès.
- Avertissement GraphQL « n'expose rien » : inatteignable (échec de
  compilation existant).
- Transtypage du fabricant générique sans `as unknown` : TypeScript refuse
  toute affectation d'un constructeur générique vérifié.

## Preuves

Points de contrôle : e3f626e3, 2f9f9385 (ADR-0311), 96af92f4 (ADR-0313),
fd7f5c3f (ADR-0312), 21496451 (Register), e15cd068 et suivants (e2e, docs).

- `yarn typecheck` : 0 erreur ; `yarn format:check` : propre ;
  `yarn constraints` : propre.
- `--project unit --project types` : 590 fichiers, 2 975 tests, 0 erreur de
  type (avant les derniers ajouts).
- `--project coverage-e2e --project coverage-postgres-e2e` : 13 échecs au
  premier passage, tous corrigés (appels réflexifs `invoke(app,
'anonymous')`, fixture `.mjs`, `start()` résolu, introspection create-app,
  complétions d'options).
- `yarn test:e2e:built` : 120 fichiers, 1 échec (archive, décision 22),
  corrigé.
- `--project website-content` : 66 / 66.

Porte finale sur 0f2f7f98 (`dist` et `*.tsbuildinfo` supprimés) :

- `yarn validate:full` : exit 0 ; couverture 687 fichiers, 3 341 tests,
  0 erreur de type ; performance 3 fichiers, 4 / 4 (hybrid-authoring compris,
  après ajout de `Register` aux sondes Typegen) ; website-content 17 / 66 ;
  lint 0 erreur. Deux passages précédents ont échoué et ont été corrigés :
  sondes de performance Typegen sans `Register` (diagnostic, pas un
  dépassement de budget) et contrat de documentation ignorant les sous-chemins
  d'exports.
- `yarn test:e2e:built` : exit 0 ; 120 fichiers, 514 tests.
- Audit DX contre 53c6ae38 (tous paquets, `tests`, `examples/minimal`,
  `examples/todo-backend`) : 661 différences, toutes expliquées : exports et
  survols déplacés vers `./plugin` (ADR-0311), `start`, `transaction`,
  `useMasterKey: boolean`, `Logger` / `LogLevel` / `PluginStartContext`,
  `logger` / `logLevel`, `PluginPrivilegeLogger` retiré, membre `hint` sur
  chaque jeton de capacité (ADR-0313), nouvelles capacités (`httpServer`,
  introspection) et exports (plugin-kit, testing), options PostgreSQL / Hono
  / Yoga / explorateurs (ADR-0312), `Register` obligatoire (JSDoc et
  diagnostics des fixtures exécutées sans `Register` par l'audit), sources
  d'exemples modifiées. Le passage de `QueryBuilder` / `WhereBuilder` en
  types n'apparaît pas dans la section `exports` de l'audit (sens du symbole
  cible) : vérifié dans `dist/index.d.ts` (`type QueryBuilder`) et par
  `public-api.test.ts`.
- Banc forme D (TS 6, médianes de 3, alterné, charge 2,65 à 3,77) :
  50 schémas édition 2 298 → 2 302 ms, froid 5 191 → 5 136 ms ; 200 schémas
  7 907 → 7 915 ms, froid 19 451 → 19 454 ms ; sans `Register` : un
  diagnostic (l'erreur `Register`) au lieu de zéro, temps inchangés
  (50 : froid 6 686 → 6 752 ; 200 : froid 67 832 → 67 003 ms).

## Prochaine action vérifiable

Revue du coordinateur.
