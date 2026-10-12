# Migration, sous-étape 6.6c : GraphQL, explorateur unique et preset `api-server` (ADR-0325)

Branche `migration/graphql` (worktree `../ub-step6-6c`), basée sur `main`
local 0e390039 (fusion de 6.6b).

## Portée

ADR-0325, décisions 1 à 9 et conséquences :

1. `.with({ graphql: { … } })` par les noms de méthodes (commandes de plugin
   comprises), hors des gabarits ; `publicWrites` et opérations publiques
   déclarées par leur propriétaire (F1) comme ADR-0324 ; retrait de la liaison
   GraphQL TEMPORAIRE de plugin-kit, de l'acquittement de Core
   (`acknowledgeUnverifiedProtection`, avertissement) et de
   `passwordAuthOperationList`.
2. Champ racine `health` (`OK`/`DEGRADED`), démarrage sans schéma exposé avec
   un avertissement.
3. Indices sur les fonctionnalités désactivées.
4. `totalCount` (seulement s'il est demandé et si `count` est permis).
5. Filtres limités aux opérateurs déclarés par l'adaptateur (ADR-0301,
   décision 5).
6. `resolveMany` des champs virtuels, résolution parallèle par parent des
   cibles incluses, tests du nombre de requêtes, documentation du N+1.
7. `graphqlPlugin({ sdl })`.
8. `graphqlExplorerPlugin({ ui })` remplace `@ultimabase/graphiql-plugin` et
   `@ultimabase/apollo-sandbox-plugin`.
9. Paquet `@ultimabase/api-server`, `apiServer({ rest, graphql, http, server })`.

Critère de fin : porte complète sur le dernier commit de code
(`yarn validate:full`, `yarn test:e2e:built`, `yarn website:test`), audit DX
expliqué, banc forme D TS6/TS7.

## État

Implémentation, tests, documentation, porte, audit DX et banc faits. Dernier
commit de code : 398fab51. Rien n'est poussé ni fusionné.

### GraphQL (`packages/graphql-plugin`)

- `rules.ts` : `GraphqlMethodRules`, `GraphqlSchemaRule`, `GraphqlRules`,
  `GraphqlSchemaRules` (`SchemaRulesHKT`), `GraphqlCommandName`,
  `GraphqlTypeNameRule` ; option de schéma de source `never` (hors gabarits),
  ancienne forme typée par Typegen (`GraphqlSchemaRule`).
- `options.ts` : `default`, `hide`, `limits`, `pagination`, `publicWrites`,
  `schemas`, `sdl` ; `operations` et `acknowledgeUnverifiedProtection`
  retirés.
- `surfaces.ts` : racines par méthode (`findOne` couvre `get` et `findOne`),
  commandes par `surface.command(name)`.
- `binding-compiler.ts` : opérations publiques (`plan({ transport })` moins
  `hide`), forme `JSON` sans liaison ; commandes par
  `planSchemaMutations({ bindings: 'optional' })`, sans liaison = entrée
  `{ id }` ; clé de règle inconnue refusée au démarrage.
- `hints.ts` : règle de validation qui remplace `FieldsOnCorrectTypeRule`
  pour les champs désactivés ; `GraphqlApplication.validationRules` (Yoga
  valide avec elles).
- `compiler.ts` : champ `health` (`HealthStatus`), faits `writes`/`exposed`.
- `exposure.ts` : refus des écritures publiques sans politique.
- `totalCount` (`output-type-compiler.ts`, `generated-execution.ts`,
  `connection-runtime.ts`).
- `declared-operators.ts` : filtres réduits aux opérateurs déclarés.
- `sdl` : écriture au démarrage des transports.

### Core

- Acquittement retiré : `acknowledgeUnverifiedProtection`,
  `reportPublicTransportProtection`, `PublicTransportProtectionOptions`,
  `PublicTransportProtectionWarning`, avertissement
  `UNVERIFIED_PUBLIC_TRANSPORT_PROTECTION`.
- `databaseFilterOperatorsCapability` (durée de vie `declaration`, unique,
  exporté par `@ultimabase/core`) ; PostgreSQL le fournit avec la même
  déclaration que `capabilities.filterOperators`.
- `resolveMany({ context, items })` (exclusif avec `resolve`) ; ordonnanceur
  (`virtual-fields/execution.ts`) ; hydratation des parents en parallèle
  (`inclusion-projection.ts`).

### Autres paquets

- plugin-kit : liaison GraphQL TEMPORAIRE retirée (`define-plugin/commands.ts`
  ne nomme plus aucun protocole ; `transport:expose` n'est plus dérivé pour
  les commandes).
- REST : acquittement interne retiré.
- Yoga : validation avec `application.validationRules`.
- `@ultimabase/graphql-explorer-plugin` (renommage de `graphiql-plugin`,
  `apollo-sandbox-plugin` supprimé) ; GraphiQL avec carte d'imports à
  empreintes (`graphiql-assets.ts`, généré par
  `tooling/graphiql-integrity/run.mjs`) ; URL `/graphiql`, en-tête envoyé
  seulement depuis `/__ultimabase/apps/{appId}/…`.
- `@ultimabase/api-server` : `apiServer()` et `ApiServerPlugins<T>` (tuple
  typé élément par élément).
- Password Auth : `passwordAuthOperationList` retiré.
- create-app : `...apiServer({ rest, graphql })`, catalogue avec
  `graphql-explorer-plugin`.

## Décisions prises (non fixées par l'ADR, à confirmer)

1. Clés de la règle : celles de REST plus `typeName` ; `findOne` couvre
   `get<Type>` et `findOne<Type>` ; les noms des champs racine ne changent pas
   (`createTodo`, `createManyTodo`). Commandes : exposées si la règle les
   nomme, ou si la règle ou le `default` vaut `true` (comme REST).
2. Opération publique sans liaison GraphQL : mutation au nom public,
   `input: JSON`, résultat `JSON`, entrée validée par le contrat de
   l'opération. Commande sans liaison : entrée `{ id }` seulement.
3. `publicWrites` : écritures = mutations générées et commandes ; les
   opérations ne comptent pas (comme REST).
4. `health` : enum `HealthStatus { OK DEGRADED }`, nom réservé ; avertissement
   « GraphQL exposes no schema or operation, only its health field ».
5. Indices : message de GraphQL suivi de `hint: enable graphql: { count: true }
on Todo` ; seulement pour les schémas de l'application ; une racine
   `Mutation` entièrement absente donne l'erreur standard de GraphQL, sans
   indice.
6. `totalCount` : connexions racine seulement quand `count` est permis ; sur
   une connexion de relation, `VALIDATION_ERROR` (Core n'a pas de compte de
   relation dans `include` : reporté).
7. `sdl` : chemin relatif au répertoire courant, écrit à chaque démarrage,
   déclaration `environment:filesystem` seulement quand `sdl` est donné.
8. Opérateurs déclarés : sans déclaration statique, GraphQL garde tous les
   opérateurs ; un champ sans opérateur déclaré sort du `Where` ; les filtres
   de chemin d'un champ `json` suivent la famille `json`, ceux d'un champ
   `object` ne sont pas réduits.
9. `resolveMany({ context, items })` exclusif avec `resolve` ; longueur
   différente = `VALIDATION_ERROR` ; appels `resolveMany` ordonnancés après
   les appels par ligne.
10. Explorateur : option `ui` (`graphiql` par défaut) ; deux explorateurs dans
    une application = `PLUGIN_DUPLICATE` (plus d'`instanceId`) ; intégrité
    sur les 19 modules réellement importés (plages de versions d'esm.sh
    remappées vers une version figée) ; workers et import calculé non
    couverts (documenté).
11. Preset : `rest`/`graphql` omis = non installés ; `graphql` accepte les
    options de `graphqlPlugin` plus `explorer` et `yoga` ; `server: false`
    retire Hono ; deux transtypages (valeur par défaut générique et tuple
    construit).
12. create-app : dépend de `@ultimabase/api-server` et garde les paquets
    composés en dépendances directes (types générés résolus avec tous les
    gestionnaires de paquets).
13. Exemple minimal : garde les plugins un par un (ses tests injectent le
    serveur et les réglages HTTP par instance, et la fabrique de schémas a
    besoin de REST et GraphQL pour typer ses règles) : écart à l'ADR, à
    trancher.

## Amendement 6.6c (2026-10-12, validé par l'utilisateur)

Revue REST, décision 7 : les formats dérivent des validateurs de l'opération.
Une opération publique sans liaison GraphQL reçoit des types dérivés de
`public.input` / `public.output` (JSON Schema) : objets → `<Opération>Input`
(entrée) et `<Opération>Result` (sortie), objets imbriqués
`<Parent><Propriété>`, énumérations de chaînes → enum (sinon `String`),
listes, nullabilité (`anyOf` avec `null`, propriété facultative), scalaires
`String`, `SafeInt` (entier), `Float`, `Boolean` ; enregistrement ouvert,
union ou autre forme → `JSON` pour cette partie seulement ; entrée `null` →
pas d'argument. La lecture Standard JSON Schema est partagée dans plugin-kit
(`readStandardJsonSchema`), utilisée par `defineOperation` et par l'OpenAPI de
REST ; la conversion en types GraphQL est dans
`graphql-plugin/src/operation-json-types.ts` et produit les mêmes métadonnées
qu'une liaison (mêmes contrôles de noms et de décodage). Les opérations avec
liaison GraphQL explicite (Password Auth, statut de l'exemple) la gardent.
Consigné dans ADR-0325, section « 6.6c amendment (2026-10-12) ».

## Approches rejetées

- Indices par post-traitement des messages d'erreur dans Yoga : il aurait
  fallu exposer la table des indices ; la règle de validation partagée suffit.
- Extraction des imports d'esm.sh par expression régulière : elle suivait des
  `import` écrits dans des chaînes (sources de workers) ; `es-module-lexer`
  lit les vraies instructions.

## Preuves

Sur 398fab51, `packages/*/dist` et `*.tsbuildinfo` hors `node_modules`
supprimés :

- `yarn validate:full` → exit 0 : « All matched files use Prettier code
  style! » ; lint 0 erreur (49 + 17 + 2 avertissements, tous de taille de
  fichier et déjà présents sur 0e390039 ; fichiers modifiés concernés :
  `inclusion-projection.ts` 567 → 568, `password-auth-plugin/src/operations.ts`
  483 → 468, `optional-product-public-api.ts` 528 → 538) ; performance « Test
  Files 3 passed (3) / Tests 4 passed (4) » ; couverture « Test Files 735
  passed (735) / Tests 3642 passed (3642) / Type Errors no errors », All files
  92,53 / 86,09 / 96,92 / 93,18 ; site « Test Files 17 passed (17) / Tests 66
  passed (66) ». Une première exécution avait échoué au contrôle Prettier
  (`plugin-facade.postgres.e2e.test.ts`), corrigé par 398fab51.
- `yarn test:e2e:built` → exit 0, « Test Files 135 passed (135) / Tests 595
  passed (595) » (`create-app-packed` compris ; seul aussi : 7/7 en 49 s).
- `yarn website:test` → exit 0, « Test Files 8 passed (8) / Tests 59 passed
  (59) ».
- Page GraphiQL vérifiée dans un navigateur (serveur local, puis arrêté) :
  l'éditeur se charge avec les empreintes ; une empreinte falsifiée bloque
  `react.mjs` (« Failed to find a valid digest ») ; `POST /graphql` sans
  en-tête répond avec l'indice (400) ; Apollo Sandbox crée son iframe.

### Audit DX (base 0e390039 construite, `--only` les 25 dossiers de paquets des deux arbres, `tests`, `examples/minimal`, `examples/todo-backend`)

1 029 différences (39 265 / 39 431 enregistrements), toutes lues :

| Groupe                    | Nombre | Cause                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------- | -----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `graphql-plugin`          |    269 | Règles par noms de méthodes (`GraphqlMethodRules`, `GraphqlSchemaRule`, `GraphqlRules`, `GraphqlSchemaRules`, `GraphqlCommandName`, `GraphqlTypeNameRule`), anciens types d'exposition retirés, options (`hide`, `publicWrites`, `sdl`), `validationRules`, `GraphqlPlugin` (environnement, source `schemaRules`), tests et fixtures réécrits                         |
| `api-server`              |    171 | Nouveau paquet (base absente)                                                                                                                                                                                                                                                                                                                                         |
| `graphql-explorer-plugin` |     90 | Nouveau paquet ; à comparer aux 75 + 75 de `graphiql-plugin` et `apollo-sandbox-plugin` (branche absente) : un plugin, une option `ui`, `GraphqlExplorerUi`                                                                                                                                                                                                           |
| `graphiql-plugin`         |     75 | Paquet retiré                                                                                                                                                                                                                                                                                                                                                         |
| `apollo-sandbox-plugin`   |     75 | Paquet retiré                                                                                                                                                                                                                                                                                                                                                         |
| `core`                    |    101 | Acquittement retiré (`PublicTransportProtectionOptions`/`Warning`, `reportPublicTransportProtection`, clés `acknowledgeUnverifiedProtection`), `databaseFilterOperatorsCapability`, `resolveMany` (`VirtualFieldManyResolver`, `VirtualFieldResolution`), 46 complétions d'exports (2 noms en moins, 1 en plus), noms de morceaux, ordre d'union `"is-not" \| "none"` |
| `tests`                   |    105 | Liste des API publiques : deux paquets ajoutés, deux retirés (décalage des index de fixtures), noms retirés                                                                                                                                                                                                                                                           |
| `examples/minimal`        |     57 | `hide` au lieu d'`operations`/acquittement, survols `graphql` de l'ancienne forme typés par Typegen, `GraphqlRules` dans `.with`, ordre d'union `"master" \| "anonymous"` (import retiré du module)                                                                                                                                                                   |
| `create-app`              |     43 | Catalogue (`graphql-explorer-plugin` au lieu des deux explorateurs) dans `PluginId`, `officialPlugins` et les options                                                                                                                                                                                                                                                 |
| `password-auth-plugin`    |     38 | `passwordAuthOperationList` retiré (déclaration, export, membres de tableau)                                                                                                                                                                                                                                                                                          |
| `postgres-plugin`         |      5 | Fournisseur `databaseFilterOperatorsCapability` dans `PostgresPluginCapabilities`                                                                                                                                                                                                                                                                                     |

### Banc forme D (base 0e390039 contre 398fab51 ; alterné, 3 exécutions, médianes)

L'application du banc n'installe pas GraphQL : aucun gain attendu ni mesuré
(le gain annoncé par l'ADR concerne les applications qui installent GraphQL).

TypeScript 6.0.3 :

| N   | Arbre   | Charges        | Éd.→diag (s) | Exécutions     | Froid (s) | Schéma (s) | Tas (Mio) | Hover |
| --- | ------- | -------------- | -----------: | -------------- | --------: | ---------: | --------: | ----: |
| 50  | base    | 2,96 3,73 4,21 |         1,90 | 1,89/1,90/1,93 |      4,52 |       1,94 |       862 |   199 |
| 50  | branche | 4,04 3,69 4,10 |         1,90 | 1,91/1,90/1,90 |      4,50 |       1,94 |       864 |   199 |
| 200 | base    | 3,93 3,19 3,37 |         6,11 | 6,11/6,12/6,11 |     14,85 |       6,03 |     2 247 |   199 |
| 200 | branche | 3,40 3,05 3,58 |         6,11 | 6,11/6,11/6,04 |     14,80 |       6,02 |     2 248 |   199 |

TypeScript 7.0.2 (`lsp-bench.mjs`, 3 exécutions) : éd.→diag 50 : 633 → 640 ms
(623/633/633 contre 629/640/642) ; 200 : 2 093 → 2 084 ms ; premier
diagnostic 713 → 710 ms (50), 2 275 → 2 248 ms (200) ; RSS 731 → 556 Mio
(50), 1 543 → 1 569 Mio (200). Charges 2,4 à 3,3. Écarts dans le bruit.
Dossiers `gen/` supprimés, worktree de base retiré.

## Prochaine action vérifiable

Relecture du coordinateur, décisions de l'utilisateur sur les points
ci-dessus, puis fusion `--no-ff` dans `main` ; supprimer ce handoff après la
fusion.
