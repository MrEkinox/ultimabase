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

Voir la section « Preuves » (commandes et résultats). Commits `wip(define-with): …` sur la
branche.

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

Voir la fin de la section « Preuves ».

## Preuves

(complété au fil des commits)
