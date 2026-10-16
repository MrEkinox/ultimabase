# Handoff : `define` décrit, `.with` configure (ADR-0339)

Branche d'intégration `feat/define-with` (base `main` 41cae632 + commit de l'ADR 1a98790e).
Toutes les phases de la migration s'y succèdent ; ne pas fusionner avant la dernière.

## Périmètre des phases

1. **Phase 1 (terminée)** : mécanisme Core (clés de fonctionnalité dans `define`,
   `indexes` complets, constructeur `.with((plugins) => …)`, règles requises, clés réservées),
   fabriques `App.UserSchema` / `App.RoleSchema`, règle `roles`, plugin-kit `features`, tests,
   banc, audit DX. Les anciennes formes restent valides pour garder le dépôt vert.
2. **Phase 2 (terminée)** — plugins officiels : clés de fonctionnalité au lieu des méthodes de forme (Soft Delete passe
   par `definePlugin({ shape })` et `shapeMethod`, ACL par `provideSchemaShapeMethods` : noms
   remplacés, pas marqués `@deprecated` pour ne pas casser la règle ESLint `no-deprecated`
   pendant la transition), messages des plugins (ACL cite encore `.with({ acl: { default } })`),
   tests et JSDoc des plugins.
3. **Phase 3 (terminée)** — codemod AST sur packages, tests, exemples (~420 `.with`, ~100 méthodes de forme,
   31 `.with({ indexes })`), puis passe manuelle.
4. Documentation (site, README, guide « features vs rules ») : branche
   `feat/define-with-docs`, en parallèle de la phase 5.
5. **Phase 5 (terminée sur `feat/define-with-cleanup`)** — retrait des anciennes formes :
   objet `.with({ … })`, méthodes de forme, `.with({ indexes })`, options
   `ensure`/`deletion`/`resolveCurrent` de `RoleSchema.define`, alias `shape`, `shapeMethod`,
   `provideSchemaShapeMethods`, noms `SchemaShapeMethod*` ; codemod supprimé du dépôt.
4. **Phase 4 (terminée)** — documentation (site, README, guide « features vs rules »).
5. Retrait des anciennes formes : objet `.with({ … })`, méthodes de forme, `.with({ indexes })`,
   options `ensure`/`deletion`/`resolveCurrent` de `RoleSchema.define`, alias `shape`,
   `shapeMethod`, `provideSchemaShapeMethods`, `SchemaShapeMethod` (renommer en `SchemaFeature`).

## État de la phase 1

Terminée ; porte complète verte sur 1b736731 (voir « Preuves »). Commits
`wip(define-with): …` sur la branche.

## Décisions de la phase 1

- **Fonctionnalités = méthodes de forme existantes.** Core dérive les clés de `define` de
  `TSource['shapeMethods']` (générique, Core ne nomme aucun plugin). Nouveaux noms Core :
  `provideSchemaFeatures` (ancien nom `provideSchemaShapeMethods` conservé), `SchemaFeature`,
  `PluginSchemaFeatureSource`, `SchemaFeatureRequiredRules`. Une fonctionnalité déclare les
  règles qu'elle exige : troisième paramètre de type `SchemaShapeMethod<…, 'acl'>` et
  `requires: ['acl']` à l'exécution. ACL déclare `acl` requis.
- **Capture** : un paramètre `const TFeatures` nu capture tout l'objet de `define` ; la
  contrainte `DefineFeatureCheck` type chaque clé (clé Core, option propre d'une fabrique,
  fonctionnalité, ou message littéral `"x is not a key of define(): use className, fields,
indexes, …"`). Les `indexes` sont vérifiés dans cette contrainte (et non par un paramètre
  séparé croisé avec `TFeatures`, cause des messages `never` / 4 500 caractères du spike).
  Pendant la première passe d'inférence (rappel `fields` ignoré) les champs d'index sont
  libres (`CompleteDefineFields` large tant que `TFeatures` n'est pas inféré) : c'est ce qui
  corrige les index sur les champs propres de `UserSchema` (échec du spike).
- **Options propres des fabriques** (`members`, `deletion`, …) sont typées dans la contrainte
  (`TOwnOptions`) : sinon une valeur invalide réduisait l'intersection des options à `never`
  et produisait trois diagnostics au lieu d'un.
- **`.with`** reste non générique. Paramètre : rappel seul si `define` a posé des clés de
  fonctionnalité (marqueur `DefinedFeatureForm`), sinon union objet | rappel (transitoire).
  Le rappel seul permet à TypeScript de placer l'erreur de règle manquante sur l'expression
  retournée (message de 3 lignes, la règle nommée en premier argument du type).
- **Constructeur** : méthodes générées depuis les noms de règles déclarés à la création du
  plugin (`provideSchemaRules(plugin, ['access'])`, appelé par chaque plugin officiel à règles
  et par `definePlugin`), plus `relations` de Core ; pas de `Proxy`. Appel répété ou rappel
  qui ne renvoie pas le constructeur : `TypeError`.
- **Règles requises** : types (retour du rappel ; enregistrement `new App({ schemas })` pour
  une déclaration sans `.with`) et exécution (`.with` et compilation de l'application).
- **Index** : un index complet unique de `define` est une cible unique même sur un champ de
  fonctionnalité ; partiel ou `.with` : stockage seulement. Avec des clés de fonctionnalité,
  la vérification des champs d'index passe de la déclaration à la compilation de
  l'application ; sans elles, rien ne change (les deux tests unitaires restent tels quels).
- **Clés réservées** (`className`, `fields`, `indexes`, `relations`, `with`) refusées à
  `UltimaBase.use` pour une fonctionnalité ou une règle.
- **Roles** : règle `roles` (`ensure`, `deletion`, `resolveCurrent`) ; les options de `define`
  restent (marquées « superseded ») ; une option posée aux deux endroits est refusée à la
  lecture (`readRoleSchemaDeclaration`). `App.UserSchema` / `App.RoleSchema` acceptent
  `indexes` et les clés de fonctionnalité ; `SchemaFactoryContext` expose `features` pour que
  la fabrique distingue une clé de fonctionnalité d'une option inconnue.
- **Fabriques et première passe** : `CompleteDefineFields` est large tant que l'objet n'est
  pas inféré, sinon la valeur par défaut de `TFields` (UserSchema) refusait les index sur les
  champs propres pendant la première passe.
- **Options sans fonctionnalité** : un `define` sans clé de fonctionnalité rend exactement les
  options vides d'avant (`Readonly<Record<never, never>>`), pour garder les types et le coût
  de la forme actuelle.
- **plugin-kit** : `features` (+ `shape`, ancien nom, pas les deux), `feature(...)` (+
  `shapeMethod`), `requires` (règles du même plugin), noms de règles déclarés à la création.
- **Tests modifiés** (contrat changé par l'ADR, chaque fois commenté) : inventaires d'exports
  (Core plugin entry : `provideSchemaFeatures`, `provideSchemaRules` ; plugin-kit : `feature`),
  `roles-plugin` (`indexes` est désormais une option et une complétion de `RoleSchema.define` :
  l'option inconnue du test devient `extensions`), `schema-form-d-types.e2e` (même membres,
  ordre d'impression différent dans deux messages `select`).

## État des phases 2 et 3

Terminées ; porte complète sur le dernier commit de la branche (voir « Preuves des phases 2
et 3 »).

### Phase 2 (plugins officiels)

- Soft Delete : `definePlugin({ features })` et `feature(...)` (type `FeatureDefinition`) ;
  JSDoc et messages internes parlent de `softDelete: true`. Le type exporté garde son nom
  `SoftDeleteShape` (renommage à faire au retrait, avec `SchemaShapeMethod`).
- ACL : `provideSchemaFeatures`, `PluginSchemaFeatureSource`, `SchemaFeature`, règle `acl`
  requise (`requires: ['acl']`, `provideSchemaRules(…, ['acl'])`). Messages :
  `Post.acl: the acl feature needs .with((plugins) => plugins.acl({ default })); …` et
  `… add existingRows to .with((plugins) => plugins.acl({ default, existingRows })) …`.
  Exports `ACLShapeSource` / `ACLShapeFields` gardés (renommage au retrait).
- JSDoc des règles des plugins officiels (Access, Hooks, Validation, REST, GraphQL,
  PostgreSQL, plugin-kit) : `.with((plugins) => …)` et `plugins.x(…)`.
- Core : message de `where` sur un champ relation :
  `… declare relation filters in .with((plugins) => plugins.relations({ name: { where } }))`.
- Roles : aucune source officielle n'utilisait les options de `define` ; tous les sites
  d'appel sont passés par le codemod (`plugins.roles({ … })`).
- Revérifié après la phase 2 puis après la phase 3 : diagnostics
  (`tests/e2e/define-with-diagnostics.e2e.test.ts`, 32/32) et matrice des cycles (0 erreur
  pour les 5 cas `define-with*`, TS 6/7, sources/paquets construits).

### Phase 3 (codemod et conversion)

- **Codemod** : `tooling/codemods/define-with/` (README, tests `transform.test.ts`,
  `markdown.test.ts`, 16 tests). Gardé dans `tooling/` (et non dans le scratchpad) car il
  servira aux utilisateurs pour migrer, avec ses tests ; branché dans Vitest (`unit`),
  `tooling/tsconfig/test.json` et ESLint. Usage :
  `node tooling/codemods/define-with/run.ts [--write] [--report r.json] [--skip p]… [--feature nom]… <chemins>`
  puis Prettier sur les fichiers modifiés. Éditions textuelles sur positions AST (API du
  compilateur TypeScript) : valeurs, commentaires, `//#region` copiés tels quels ; les
  commentaires avant une méthode de forme suivent la clé dans `define`, les marqueurs de
  région restent en place ; `.with` vidé par le déplacement des `indexes` est supprimé.
  Fichiers TS/JS et blocs `ts/tsx/js/jsx` des md/mdx, sauf blocs synchronisés par région.
  Ne devine jamais : signale `non-literal-with`, `unconvertible-with-entry`,
  `non-literal-define`, `unknown-shape-method`, `unrooted-with-object`,
  `unrooted-shape-method`, `unexpected-chain`, `with-callback-without-plugins`
  (et `region-moved` pour relecture).
- **Exécutions** : défaut sur `packages tests examples tooling apps/website/{content,components,lib,app,tests}` ;
  `--feature archivable --feature flaggable --feature decimalLedger` sur les sites
  communautaires (tests Access/REST, façade, open-kernel, register-cycle `defined-plugin`,
  exemple plugin-authoring) ; puis les fixtures `.mjs`. Total appliqué : 167 fichiers,
  343 `.with` objet, 99 méthodes de forme, 19 `.with({ indexes })`, 29 déclarations Role ;
  après retour des tests des anciennes formes : 338 / 99 / 15 / 22.
- **Sites manuels** (convertis à la main) : aides de test `declare(...)` de Soft Delete
  (`declareLogical`/`declareCommand`) et d'ACL (`acl-option.test-d.ts`, backfill) ;
  `.with(variable)` sur règles installées (REST `routes`/`http-responses`/`virtual-http`,
  Hooks `schema-mutation-hooks`, PostgreSQL `options.test.ts`, `alternative-policy-engine`) ;
  code dans des chaînes (IntelliSense Access/ACL/GraphQL/Hooks/REST/Roles/Soft Delete,
  PostgreSQL et Soft Delete e2e, `access-registered-rule-keys`, `principal-language-service`,
  `register-required`) ; générateurs create-app (`withRules` produit le texte que Prettier
  imprime ; `privateSchemaApiOptions` rend `rest(false)`) et page Quick Start ; exemple de
  la page d'accueil (`capability-content.ts`) ; fixture ACL JavaScript ; plugins de fixture
  bruts qui déclarent maintenant leurs noms de règles (`provideSchemaRules` :
  `alternative-policy-engine`, `alternative-behavior-engine`, `plugin-kit/authoring.test.ts`,
  `plugin-operation-javascript.mjs`) ; exemple `plugin-authoring/flag-plugin.ts`
  (`provideSchemaFeatures` + `provideSchemaRules`) et `archive-plugin.ts` (`features`) ;
  fixtures `shape`→`features` des tests Access/REST/façade/register-cycle ; fixture
  open-kernel (`provideSchemaFeatures`).
- **Tests modifiés** (assertion de la forme elle-même, convertie en équivalent) :
  `acl-option.test.ts` (message ACL), `acl-intellisense.test.ts` (JSDoc de la règle),
  `relation-rules.test.ts` (message `relations`), `base-template.test.ts` et
  `api-template.test.ts` (code généré), `schema-form-d-types.e2e.test.ts` (lignes +1 de
  `typos.ts`, et `relations` sur un schéma sans relation : « Property 'relations' does not
  exist on type 'SchemaRulesBuilder<… » au lieu de « Object literal may only specify known
  properties »), `plugin-authoring/tests/schema-misuse.test.ts` (règle non installée :
  `plugins.audit is not a function` à l'appel de `.with` au lieu d'une erreur de
  compilation), `soft-delete-intellisense.test.ts` (complétion de la clé `softDelete` dans
  `define`). Les tests de types qui appelaient une règle inexistante lisent maintenant
  `plugins.x` (`void plugins.x`) : l'appel d'une méthode inexistante déclenchait
  `no-unsafe-call` (Core `schema-declarations.test-d.ts`, ACL, PostgreSQL, testing
  `conformance.test-d.ts`). Deux casts `as unknown as UntypedRules` dans
  `examples/plugin-authoring/tests/schema-misuse.test.ts` pour garder l'appel à
  l'exécution. Titres de tests ajustés seulement là où ils citaient le message ou la forme
  (relation-rules, acl-option.test-d, schema-misuse).
- **Anciennes formes restantes** (tests des anciennes formes, laissés pour le retrait) :
  - `.with({ indexes })` comme index de stockage seulement : Core
    `unique-target-origins.test.ts`, `unique-targets.test-d.ts`,
    `schema-command-execution.test.ts`, `partial-indexes.test.ts` (2e test : vérification à
    la compilation) et `partial-indexes.test-d.ts` (typage du `where` dans `.with`) ;
  - options Role dans `define` : `role-schema.test.ts` (normalisation `deletion`/`ensure`
    lue à la déclaration), `role-rules.test.ts` (conflit des deux emplacements) ;
  - méthodes de forme et chaîne : Core `schema-declaration-chain.test.ts`,
    `define-features.test.ts`, `projection-slots.test-d.ts` (`.flag()`),
    `schema-factories.test-d.ts` (`.tagged()`) ; plugin-kit `define-plugin.test(-d).ts`
    (`shape`, `.archivable()`, `.labelled()`) ;
  - forme objet comme passage d'options brutes (`… as never`, option sans plugin installé,
    `Unknown schema option`) : Core `opaque-selectors`, `schema-declaration-registry`,
    `schema-field-transformations` (3), `schema-option-compilation` (6),
    `schema-option-ownership`, `schema-option-presence` (3), `relation-rules.test.ts` (2),
    `direct-community-options.e2e` ; PostgreSQL `options.test.ts` (plugin absent) et
    fixture JS `postgres-direct-options-javascript.mjs` ; Soft Delete `plugin.test.ts`
    (plugin absent) ; Roles `role-schema.test.ts` (marqueur d'identité copié),
    `role-rules.test.ts` (`roles` sur un schéma non Role) ; plugin-kit
    `define-plugin.test.ts` (`BadRule`) ; fixture JS ACL (`MissingPluginPost`) ;
    `alternative-policy-engine.e2e` (branche ACL sans plugin ACL). Au retrait, il faut une
    autre voie pour ces options brutes (ou supprimer ces tests) : décision à prendre.
  - outils : `examples/schema-form-d/tools/gen.mjs` (génère la forme actuelle pour le banc
    comparatif) ; les chaînes des tests de diagnostics de la phase 1 couvrent les deux formes.
    Le codemod signale 45 sites restants (25 `non-literal-with`, 10 `unknown-shape-method`,
    10 `unrooted-with-object`) et en convertirait 9 fichiers (tous dans la liste ci-dessus).
- **Régions** : les régions placées dans un objet `.with` extraient maintenant un fragment
  `.relations({ … })` au lieu de `relations: { … },` (`examples/minimal#relation-views`) :
  aussi peu autonome qu'avant ; à revoir en phase 4.
- `.prettierignore` ignore `examples/schema-form-d/gen/` (projets de banc générés, déjà
  ignorés par Git).

## État de la phase 5 (retrait)

Branche `feat/define-with-cleanup` (depuis `feat/define-with` 6678d974), en parallèle de la
phase 4 (`feat/define-with-docs`, prose du site et des README, guide plugin,
`examples/plugin-authoring`) : cette branche ne touche ni `apps/website/content`, ni la
prose des README, ni `examples/plugin-authoring` ; seuls les blocs de région des README
sont régénérés par `yarn docs:regions` (commentaires d'exemples modifiés).

### API retirées et renommées

- Core : `.with` n'accepte que `(plugins) => plugins…` (objet refusé à l'exécution :
  `Post.with() takes a callback: .with((plugins) => plugins.access({ … }))`) ; méthodes de
  forme et chaîne générique supprimées (`SchemaShapeMethods`, paramètre `TUsed` de
  `DeclaredSchema`, `DefineFeatureNames`, marqueur `DefinedFeatureForm`, union transitoire) ;
  `.with({ indexes })` supprimé (`ConfiguredSchemaIndexRules`, `ruleIndexes` de la
  compilation) : tout index est dans `define`, un index complet unique est une cible, un
  index partiel n'impose que l'unicité ; `provideSchemaShapeMethods` supprimé.
  Renommages : `SchemaShapeMethod` → `SchemaFeature` (l'interface elle-même),
  `SchemaShapeMethodImplementation(s)` → `SchemaFeatureImplementation(s)`,
  `PluginSchemaShapeSource` supprimé (seul `PluginSchemaFeatureSource`), clé d'état source
  `shapeMethods` → `features` ; internes : `SchemaFeatureArguments`, `SchemaFeatureOptions`,
  `SchemaFeatureRuntime`, `readSchemaFeatures`. Gardés (ils nomment l'enregistrement de
  forme, toujours lu par les emplacements `this['shape']`) : `DeclaredSchemaShape`,
  `SchemaShapeOf`, `SchemaFactoryShape`, membre `shape` des HKT, `shapeFields`. Gardé aussi :
  `SchemaRuleIndexOptions` (JSDoc corrigée : index de `define`).
- plugin-kit : option `shape` et `shapeMethod` supprimés ; `shape.ts` → `feature.ts` ;
  `ShapeMethodDefinition` → `FeatureDefinition` (interface), `ShapeMethodFields` →
  `FeatureFields`, `ShapeMethodCommands` → `FeatureCommands`, `ShapeMethods` →
  `FeatureDefinitions`, `ShapeMethodArguments` → `FeatureArguments`,
  `DefinedShapeFields`/`DefinedShapeCommands` → `DefinedFeatureFields`/`DefinedFeatureCommands` ;
  messages : `Invalid feature name`, `Rule x is also a feature`, `Unknown feature option`,
  `feature … must …`, et `Post.flag: flag takes only true`.
- Soft Delete : `SoftDeleteShape` → `SoftDeleteFeatures`. ACL : `ACLShapeSource` →
  `ACLFeatureSource`, `ACLShapeFields` → `ACLFeatureFields`. Roles : options `ensure`,
  `deletion`, `resolveCurrent` retirées de `RoleSchema.define` (`Unknown RoleSchema option`),
  plus de conflit entre emplacements. Auth : `DefineFeatureNames` retiré de la signature.
- JSDoc : exemples des règles en forme constructeur (Access, Hooks, REST, GraphQL,
  PostgreSQL, Validation, `relations`, `isAuthenticated`).

### Appel JavaScript d'une règle absente

Sans `Proxy`, le constructeur n'a que les méthodes déclarées. `collectSchemaRules` exécute le
rappel dans un `try` : une `TypeError` qui ne vient pas du constructeur est relancée avec
`cause` et le contexte : `plugins.audit is not a function in Note.with((plugins) => …):
plugins offers relations, access; a rule needs the plugin that declares it`. Le message du
moteur reste en tête (le test de `examples/plugin-authoring` qui cherche
`plugins.audit is not a function` passe toujours). Les autres erreurs passent telles quelles.

### Tests des anciennes formes

Supprimés ou convertis (aucune assertion d'un comportement existant perdue) :

- Méthodes de forme / chaîne : `schema-declaration-chain.test.ts` (chaîne → clés de
  `define`, plus aucune méthode `mark` ; refus de l'objet `.with` ajouté),
  `define-features.test.ts` (titre), `projection-slots.test-d.ts` (`.flag()` → `flag: …` ;
  « méthode unique » → « une fonctionnalité n'est pas membre du schéma »),
  `schema-factories.test-d.ts` (`.tagged()` → `tagged: true`, règle requise via le 3e
  paramètre de `SchemaFeature`), `schema-factories.test.ts` (fabriques héritées : la
  fonctionnalité du fils est appliquée, pas celle du parent), plugin-kit
  `define-plugin.test(-d).ts` (`shape`/`shapeMethod` → `features`/`feature` ; « alias
  `shape` » → `Unknown definePlugin option: shape` ; option invalide d'une fonctionnalité :
  refus de `define` pour une valeur non objet, validation à la compilation gardée par
  `flag: { loud: true }`), `open-kernel-proof.e2e` (`.decimalLedger()`).
- `.with({ indexes })` : `unique-target-origins.test.ts`, `unique-targets.test-d.ts`
  (l'index partiel passe dans `define` ; l'assertion « index complet de `.with` refusé comme
  cible » supprimée : ce cas n'existe plus, l'index d'un plugin reste couvert),
  `schema-command-execution.test.ts` (index partiel de `define` refusé par chaque commande),
  `partial-indexes.test-d.ts` (chaque `where` non portable dans `define`),
  `partial-indexes.test.ts` (vérification différée à la compilation déplacée dans
  `define-features.test.ts` avec une fonctionnalité).
- Options Role : `role-schema.test.ts` (normalisation `deletion`/`ensure` → refus des clés
  retirées et valeurs par défaut), `role-rules.test.ts` (conflit supprimé ; normalisation
  `ensure`, noms vides, liste, `resolveCurrent` passées par `plugins.roles`).
- Options brutes (`as never`, plugin absent) :
  - Core interne : aide de test `packages/core/src/schema/schema/raw-schema-rules.test-support.ts`
    (`defineWithRawRules`, exclue du build, non exportée) qui déclare comme `.with` après
    lecture des règles : `opaque-selectors`, `schema-declaration-registry`,
    `schema-field-transformations` (3), `schema-option-compilation` (6),
    `schema-option-ownership`, `schema-option-presence` (3) ;
  - par le constructeur avec valeur mal formée : `relation-rules.test.ts` (2), plugin-kit
    `BadRule`, `role-rules` (`roles` sur un schéma non Role : `void plugins.roles` sous
    `@ts-expect-error` puis appel JavaScript) ;
  - « propriétaire absent » = schéma déclaré là où le plugin est installé puis enregistré
    dans une application sans lui : `direct-community-options.e2e` (plugin de fixture avec
    `provideSchemaRules`), Soft Delete `plugin.test.ts`, PostgreSQL `options.test.ts` et
    fixture JS (+ message JavaScript d'une règle absente), fixture JS ACL (+ refus de la
    forme objet) ;
  - `alternative-policy-engine.e2e` : branche ACL déclarée avec ACL installé (typée, sans
    cast) ;
  - Roles « marqueur d'identité copié » : forgé par une fabrique de schéma de plugin
    (`provideSchemaFactories`), seule voie restante, qui passe ses options à `define` telles
    quelles.
- Inventaires d'exports : Core `./plugin` (sans `provideSchemaShapeMethods`), plugin-kit
  (sans `shapeMethod`), Soft Delete (`SoftDeleteFeatures` ; `SoftDeleteShape` en noms
  retirés).

### Codemod et générateur

- Le codemod `tooling/codemods/define-with/` est supprimé (UltimaBase n'est pas publié :
  aucune migration utilisateur), avec son branchement Vitest, `tooling/tsconfig/test.json`,
  ESLint et `tooling/README.md` ; dernière exécution avant suppression : 0 fichier à
  convertir sur `packages tests examples tooling apps/website`.
- `examples/schema-form-d/tools/gen.mjs` génère seulement la nouvelle forme (sortie
  `gen/form-d[-noreg]-<N>`, inchangée pour `campaign.mjs`) ; `gen-define-with.mjs` supprimé ;
  `tools/probe.json` vise `.with((`. Le README de l'exemple (prose, phase 4) cite encore
  `gen-define-with.mjs` et les anciennes formes.

### Restes hors périmètre (phase 4)

Commentaires et titres de `examples/plugin-authoring` (`.with({ audit: true })`,
`.archivable()`, « shape method ») ; prose du site, de `ARCHITECTURE.md` et des README ;
`examples/schema-form-d/README.md`.

## Limites connues

- Une faute dans `define` (clé, option, index) fait échouer l'appel générique ; TypeScript
  ré-infère alors sans le rappel `fields` (comportement de `checker.ts`), donc les autres
  fichiers qui lisent les champs typés du schéma voient `unknown` (cascade). Identique à
  `main` pour une faute dans `define` (vérifié sur la ligne de base). La déclaration elle-même
  ne donne qu'un diagnostic, sur sa ligne.
- (Résolu en phase 5) La forme union disparue, un rappel `.with` qui ne renvoie pas le
  constructeur est refusé par les types comme à l'exécution.
- Depuis JavaScript, appeler une règle qu'aucun plugin installé ne déclare reste la
  `TypeError` du moteur (`plugins.audit is not a function`), relancée avec le contexte (voir
  phase 5) ; pas de `Proxy` (choix de l'ADR).

## État de la phase 4 (documentation)

Branche `feat/define-with-docs` (depuis 6678d974), commits `docs(define-with): …`.

- **Site** : 24 pages `.mdx` (23 modifiées, 1 nouvelle), `reviewedAt: 2026-10-17`,
  ADR-0339 ajoutée aux `sources` des pages qui expliquent la forme. Page Schemas :
  section « Plugin features and rules » (deux blocs, pourquoi deux blocs sans
  jargon TypeScript, Role/User) et tableau « Where each declaration goes » (titre
  sans « ? » : la règle de titres du site refuse la ponctuation finale ; la
  question « Where does it go? » ouvre le paragraphe). Lien vers le tableau
  depuis using-plugins et les sections de configuration des pages Access, ACL,
  GraphQL, Hooks, Password Authentication, PostgreSQL, REST, Roles, Soft Delete,
  Validation (HTTP, Hono et pg-vector n'ont pas d'option de schéma).
- **Nouvelle page** `plugins/build-a-plugin/features-and-rules.mdx` (concept) :
  feature vs rule, `requires`, contrats Core bruts (`provideSchemaFeatures`,
  `provideSchemaRules`, `SchemaRulesHKT`, `this['shape']`), noms réservés,
  conseils de nommage, liste de décision. Ajoutée à `meta.json`, au plan
  (`documentation-plan.json`) et à la navigation canonique du test
  `apps/website/tests/documentation-navigation.content.test.ts` (seul test du
  site modifié, pour la nouvelle page). Propriétaire : la section
  `plugins/build-a-plugin` couvre déjà la page (`documentation-ownership.json`
  inchangé).
- **Exemple** `examples/plugin-authoring` : `src/review-plugin.ts` (feature
  `reviewable` qui exige la règle `review`, `afterCommit`) et
  `tests/features-and-rules.test.ts` (4 tests : champ, commande et journal après
  commit sur PostgreSQL ; règles lues par `readSchemaRules` ; règle requise
  absente : `@ts-expect-error` sur le rappel et `TypeError` à `.with` et à la
  compilation ; règle dans `define`, feature appelée sur `plugins`). Régions
  `review-plugin`, `reviewed-story`, `approve-story`, `missing-rule`.
- **Régions** : `examples/minimal#relation-views` couvre maintenant
  l'expression `plugins.relations({ … })` (appel `.relations` placé en tête de la
  chaîne, ordre sans effet, et un commentaire avant `.relations` pour que
  Prettier garde la chaîne dépliée dans les README) ; `todo-backend#todo-rules`
  commence à `indexes` dans `define` et montre les deux blocs.
  `acl#client-sharing` et `todo-backend#todo-title` restent des propriétés
  (inchangées par la migration).
- **README** : 15 README de paquets, `packages/core/docs/schema.md`, 8 README
  d'exemples, README racine (bloc twoslash converti), section « Features and
  rules » de plugin-kit (remplace l'ébauche de la phase 1, régions de
  l'exemple review).
- **Commentaires d'exemples** (`src` seulement, plus trois commentaires de
  tests de plugin-authoring) mis à jour. Laissés à la phase 5 : titres de tests
  de plugin-authoring (« with .archivable() », « call the shape method ») et
  `tests/schema-misuse.test.ts` (message `plugin rules go in the final .with(...)`).
- **AGENTS.md** (ligne de la forme de déclaration), `ARCHITECTURE.md`,
  `docs/current-architecture.md` (ADR-0339 dans la ligne « Schema declaration
  form ») : mises à jour factuelles.
- **Pas de section de migration ni de mention du codemod** (consigne du
  coordinateur : pré-version, le codemod est supprimé en phase 5). Une ligne
  pré-existante du tableau « Migrate pre-release authoring » de using-plugins
  décrit désormais la forme actuelle.
- Sources de pages pointant vers des fichiers que la phase 5 pourrait
  supprimer : `packages/core/src/schema/schema/schema-declaration-chain.ts`
  (Schemas, Schema Contributions, `docs/current-architecture.md`),
  `packages/plugin-kit/src/define-plugin/shape.ts` (Features and Rules) ; à
  corriger si la phase 5 les renomme.

### Preuves de la phase 4

Journaux : `/private/tmp/claude-501/…/scratchpad/define-with-p4/` (non versionnés).
`yarn build` préalable (0).

- `yarn vitest run --project website-content` 0 (20 fichiers, 214 tests) ;
- `yarn docs:regions --check` 0 ;
- `yarn website:test` 0 (8 fichiers, 59 tests) ;
- Prettier `--check` sur tous les fichiers touchés : 0 ;
- `typecheck` des exemples minimal, todo-backend, plugin-authoring,
  soft-delete, access, hooks, validation, schema-form-d : 0 ;
- `yarn workspace @ultimabase/example-plugin-authoring test` 0 (14 fichiers,
  42 tests) ; `tests/e2e/relation-filter-public-vertical.postgres.e2e.test.ts`
  0 (8 tests, exemple minimal réordonné).
- Recherche finale des anciennes formes (site, README, docs Core,
  ARCHITECTURE, AGENTS) : ne restent que les ADR et ce handoff.

## Prochaine action vérifiable

Fusionner `feat/define-with-cleanup` (phase 5) et `feat/define-with-docs` (phase 4) dans
`feat/define-with`, relancer `yarn docs:regions` (blocs README régénérés des deux côtés)
puis la porte complète ; supprimer ce handoff à la fusion dans `main`.
Phase 5 (retrait, agent parallèle) puis fusion de `feat/define-with-docs` dans
`feat/define-with` ; après la fusion, relancer `yarn vitest run --project
website-content` et `yarn docs:regions --check` (les messages et sources
changés par la phase 5 peuvent toucher les pages). Avant la fusion dans
`main` : audit DX et banc forme D (non exécutés depuis la phase 1), puis
`yarn validate:full`.

## Preuves

Journaux de la phase 1 : `/private/tmp/claude-501/…/scratchpad/define-with-p1/` (session de
l'agent, non versionnés).

- Matrice des cycles (ordres de fichiers racine : alphabétique, inverse, chaque fichier en
  premier ; TS 6 et 7 ; sources et paquets construits) : 0 erreur pour `define-with`,
  `define-with-mutual`, `define-with-contribution`, `define-with-user`, `define-with-role`.
- Diagnostics (`tests/e2e/define-with-diagnostics.e2e.test.ts`, TS 6 service de langage et
  TS 7 compilateur, sources et paquets construits) : un diagnostic sur sa ligne pour clé
  inconnue, option de fonctionnalité, champ et `where` d'index, commande sans fonctionnalité,
  méthode appelée deux fois, règle requise absente du rappel, `.with` absent à
  l'enregistrement ; complétions de `Post.` sans membre de configuration.
- Banc forme D (médianes de 3 exécutions entrelacées, charge 1 min < 4, paquets construits par
  `yarn build`, `main` = arbre détaché 41cae632), secondes édition → diagnostics :

  | Variante                | TS 7, 50 | TS 7, 200 | TS 6, 50 | TS 6, 200 |
  | ----------------------- | -------: | --------: | -------: | --------: |
  | `main`, forme actuelle  |     0.56 |      1.88 |     1.96 |      5.78 |
  | branche, forme actuelle |     0.57 |      1.92 |     1.99 |      5.92 |
  | branche, nouvelle forme |     0.55 |      1.81 |     1.91 |      5.64 |

  Instanciations (TS 6 / TS 7) : 50 schémas `main` 1 932 345 / 4 286 929, forme actuelle
  1 952 491 / 4 366 463 (+1,0 % / +1,9 %), nouvelle forme 1 999 019 / 4 403 110 ;
  200 schémas `main` 8 922 135 / 19 220 889, forme actuelle 8 999 911 / 19 527 793
  (+0,9 % / +1,6 %), nouvelle forme 9 725 729 / 20 753 778 (plus d'instanciations, moins de
  types : 525 501 contre 546 235, et plus rapide). Coût de la forme actuelle mesuré par
  expériences : capture de `define` ~0,4 %, types de résultat ~0,3 %, reste ~0,4 % ; l'union
  du paramètre de `.with` ~0,02 %. La forme actuelle disparaît en phase 3/5.

- Audit DX (`node tooling/dx-audit/run.mjs <main 41cae632 construit> . --only
core,plugin-kit,auth-plugin,roles-plugin`, paquets construits par `yarn build` seul) :
  636 différences, toutes attendues : nouveaux exports (Core `./plugin` : 11 types et
  `provideSchemaFeatures`, `provideSchemaRules` ; Core : `SchemaRulesBuilder`,
  `CompleteSchemaRules` ; plugin-kit : `feature`, `FeatureDefinition`, `FeatureRequiredRules` ;
  roles : `RoleRules`, `RoleSchemaRules`) ; survol de `define` (paramètre `TFeatures` capturé
  au lieu de `TIndexes`, alias `ConfiguredSchemaDeclarationOptions` conservé) ; survol des clés
  `fields`/`className` dans `define` (type déclaré `&` type capturé) ; survol de `.with`
  (union objet | rappel) ; troisième paramètre de type de `SchemaShapeMethod` et
  `SchemaShapeMethodImplementation` ; source de Roles avec son emplacement de règles
  (`schemaRules: readonly [RoleSchemaRules]`) ; `indexes` dans les complétions et options de
  `RoleSchema.define`/`UserSchema.define` ; JSDoc de `define`/`.with`/options remplacées ;
  ordre d'impression de membres identiques ; diagnostic d'une politique `deletion` invalide :
  `'"cascade" | "fail" | "preserve"'` au lieu de `'RoleReferenceDeletionPolicy'` ; survol de la
  clé `audit` d'un objet `.with` invalide (`audit: string` au lieu de la règle, effet de
  l'union transitoire). Attention : après `yarn validate:full`, `dist/` contient aussi la
  sortie fichier par fichier de `tsc --build`, ce qui gonfle l'audit (5 013 différences
  privées) ; supprimer `dist/` et relancer `yarn build` avant l'audit.
- Porte (YARN_CACHE_FOLDER du dépôt principal, `dist/` et `*.tsbuildinfo` supprimés) :
  `yarn install --immutable` 0 ; `yarn validate:full` 0 (après suppression des projets
  générés `examples/schema-form-d/gen/`, non ignorés par Prettier) ; `yarn website:test` 0 ;
  `yarn typecheck:typescript-7` 0 ; `yarn docs:regions --check` 0 ; `yarn test:e2e:built` 1 :
  seul `create-app-packed` « writes a valid graph for each official plugin selected alone »
  dépasse 120 s sous charge (≈ 10), suite sensible à la charge connue ; relancé seul : 8/8 en
  42,5 s (`main` seul : 37,2 s pour ce test, 40,3 s sur la branche).

## Preuves des phases 2 et 3

Journaux : `/private/tmp/claude-501/…/scratchpad/define-with-p2/` (session de l'agent, non
versionnés). Porte sur 79c28f9f (seul ce paragraphe de preuves a été ajouté ensuite),
`YARN_CACHE_FOLDER` du dépôt principal, `packages/*/dist`, `*.tsbuildinfo` et
`examples/schema-form-d/gen/` supprimés avant :

- `yarn install --immutable` 0 ;
- `yarn validate:full` 0 (couverture : 741 fichiers, 3 963 tests ; types sans erreur ;
  site 20 fichiers, 213 tests) ;
- `yarn test:e2e:built` 1 : seul `create-app-packed` « writes a valid graph for each official
  plugin selected alone » dépasse 120 s (charge 1 min ≈ 9,7 au départ), suite sensible à la
  charge connue ; relancée seule : 8/8 en 39,8 s ; les 700 autres tests passent ;
- `yarn website:test` 0 (8 fichiers, 59 tests) ; `yarn typecheck:typescript-7` 0 ;
  `yarn docs:regions --check` 0 ;
- codemod : `yarn vitest run --project unit tooling/codemods` 16/16 ;
- diagnostics `define-with` 32/32 et matrice des cycles 0 erreur (après chaque phase).

Non exécuté dans ces phases : l'audit DX (`tooling/dx-audit`) et le banc forme D ; à refaire
avant la fusion (les JSDoc des règles et les messages ACL / `relations` ont changé).

## Preuves de la phase 5

Journaux : `/private/tmp/claude-501/…/scratchpad/define-with-p5/` (session de l'agent, non
versionnés). Ligne de base : arbre détaché de `main` 41cae632 construit dans le scratchpad
(`yarn install --immutable`, `yarn build`), supprimé après le banc et l'audit.

- Banc forme D (`tools/editbench.mjs 3 50,200`, 3 exécutions entrelacées, chacune lancée sous
  une charge 1 min < 4 : charges relevées 2,29–3,28), secondes édition → diagnostics,
  médianes ; `main` en forme actuelle de `main`, branche en nouvelle forme
  (`tools/gen.mjs`) :

  | Variante | TS 7, 50 | TS 7, 200 | TS 6, 50 | TS 6, 200 |
  | -------- | -------: | --------: | -------: | --------: |
  | `main`   |     0.56 |      1.89 |     1.95 |      5.80 |
  | branche  |     0.54 |      1.82 |     1.91 |      5.57 |

  Seuils ADR-0297 (TS 7 ≤ 0,6 / ≤ 2 s, TS 6 ≤ 2 / ≤ 6 s) respectés ; branche ≤ `main`
  partout. Instanciations (une mesure, TS 6 / TS 7) : 50 schémas `main` 1 932 345 /
  4 286 929, branche 1 974 631 / 4 342 291 ; 200 schémas `main` 8 922 135 / 19 220 889,
  branche 9 449 011 / 20 153 863 (types : 524 415 contre 546 235 sur TS 6 ; la phase 1
  mesurait 9 725 729 en nouvelle forme avec l'union transitoire).

- Audit DX (`node tooling/dx-audit/run.mjs <main construit> . --only core,plugin-kit,
soft-delete-plugin,acl-permissions-plugin,roles-plugin,auth-plugin,access-plugin,
hooks-plugin,validation-plugin,rest-plugin,graphql-plugin,postgres-plugin`, après
  suppression de `dist/` et `yarn build`) : 3 882 différences, cumul des phases 1 à 5, toutes
  expliquées :
  - exports (47) : ajouts des phases 1–2 (`SchemaRulesBuilder`, `CompleteSchemaRules`,
    `provideSchemaFeatures`, `provideSchemaRules`, `DefineFeature*`, `ConfiguredSchemaIndex`,
    `RoleRules`, `RoleSchemaRules`, `feature`…) et renommages/retraits de la phase 5
    (`SchemaShapeMethod*`, `PluginSchemaShapeSource`, `provideSchemaShapeMethods`,
    `SchemaShapeMethods`, `shapeMethod`, `ShapeMethod*`, `DefinedShape*`, `SoftDeleteShape`,
    `ACLShape*` → noms de fonctionnalité) ;
  - déclarations, survols d'export et de membres : mêmes types, JSDoc réécrite (ADR-0339,
    exemples `plugins.x(…)`), `.with` à rappel seul, `RoleSchemaOptions` sans options de
    comportement, `UserSchemaFactory`/`RoleSchemaFactory` sans `DefineFeatureNames` ;
  - survols d'usage (3 320) : `DeclaredSchema` a un argument de type de moins (`TUsed`
    retiré) et la clé d'état source `shapeMethods` devient `features` (≈ 1 630, plus les
    troncatures qui en découlent : un type plus court s'imprime plus loin) ; signature
    survolée de `define` (objet capturé `TFeatures`) et clé `fields` (phase 1, 174) ;
    fichiers de test convertis aux phases 3 et 5 (≈ 830, plus 385 sites ajoutés et 67
    retirés) ; documentation seule (79) ;
  - complétions et diagnostics d'usage (68) : fixtures IntelliSense converties (phase 3),
    `indexes` n'est plus proposé dans `.with`, message de clé inconnue de `define`,
    impressions de `DeclaredSchema` raccourcies.
- Porte sur 818f979e (seul ce paragraphe de preuves a été ajouté ensuite),
  `YARN_CACHE_FOLDER` du dépôt principal, `packages/*/dist`, `*.tsbuildinfo` et
  `examples/schema-form-d/gen/` supprimés avant :
  - `yarn install --immutable` 0 ;
  - `yarn validate:full` 1 : `format:check`, `typecheck`, `lint` (0 erreur), `build`,
    `test:performance` passent ; couverture 738/739 fichiers, 3 946/3 947 tests, types sans
    erreur ; seul échec `tooling/documentation/active-contracts.test.ts` « typechecks the
    complete root journey » : le bloc de code du `README.md` racine utilise encore
    `.softDelete({ mode: 'command' })` (prose, corrigée sur `feat/define-with-docs`) ;
    étapes suivantes lancées à part : `yarn constraints` 0, `yarn website:validate` 1 avec
    le même bloc (`compiled-snippets` « README.md:17 », 212/213) ;
  - `yarn test:e2e:built` 1 : seul `create-app-packed` « writes a valid graph for each
    official plugin selected alone » dépasse 120 s (charge 1 min ≈ 15, deux agents) ;
    relancé seul (charge 3,35) : 8/8 en 34,4 s ; les 700 autres tests passent ;
  - `yarn website:test` 0 (8 fichiers, 59 tests) ; `yarn typecheck:typescript-7` 0 ;
    `yarn docs:regions --check` 0.
- Recherches finales (`.with({`, `.softDelete(`, `.acl()`, `shapeMethod`,
  `provideSchemaShapeMethods` dans le code de `packages tests examples tooling apps`) : seuls
  deux commentaires de `examples/plugin-authoring` (phase 4) ; les résultats historiques
  `examples/schema-form-d/results/*.json` citent encore `shapeMethods`.
