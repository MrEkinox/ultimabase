# Handoff : `define` décrit, `.with` configure (ADR-0339)

Branche d'intégration `feat/define-with` (base `main` 41cae632 + commit de l'ADR 1a98790e).
Toutes les phases de la migration s'y succèdent ; ne pas fusionner avant la dernière.

## Périmètre des phases

1. **Phase 1 (ce document, en cours)** : mécanisme Core (clés de fonctionnalité dans `define`,
   `indexes` complets, constructeur `.with((plugins) => …)`, règles requises, clés réservées),
   fabriques `App.UserSchema` / `App.RoleSchema`, règle `roles`, plugin-kit `features`, tests,
   banc, audit DX. Les anciennes formes restent valides pour garder le dépôt vert.
2. Plugins officiels : clés de fonctionnalité au lieu des méthodes de forme (Soft Delete passe
   par `definePlugin({ shape })` et `shapeMethod`, ACL par `provideSchemaShapeMethods` : noms
   remplacés, pas marqués `@deprecated` pour ne pas casser la règle ESLint `no-deprecated`
   pendant la transition), messages des plugins (ACL cite encore `.with({ acl: { default } })`),
   tests et JSDoc des plugins.
3. Codemod AST sur packages, tests, exemples (~420 `.with`, ~100 méthodes de forme,
   31 `.with({ indexes })`), puis passe manuelle.
4. Documentation (site, README, guide « features vs rules »).
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

## Limites connues

- Une faute dans `define` (clé, option, index) fait échouer l'appel générique ; TypeScript
  ré-infère alors sans le rappel `fields` (comportement de `checker.ts`), donc les autres
  fichiers qui lisent les champs typés du schéma voient `unknown` (cascade). Identique à
  `main` pour une faute dans `define` (vérifié sur la ligne de base). La déclaration elle-même
  ne donne qu'un diagnostic, sur sa ligne.
- Forme union (déclarations sans clé de fonctionnalité) : un rappel qui ne renvoie rien est
  accepté par les types (l'objet tout-optionnel l'absorbe) et refusé à l'exécution ;
  disparaît avec la forme objet.

## Prochaine action vérifiable

Phase 2 (plugins officiels) : migrer Soft Delete (`definePlugin({ features })`, `feature`) et
ACL (`provideSchemaFeatures`, message de règle requise au nouveau format), puis vérifier
`yarn vitest run --project e2e tests/e2e/define-with-diagnostics.e2e.test.ts` et la matrice
`tests/register-cycle/define-with*` sur TypeScript 6 et 7.

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
