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

Implémentation, tests et documentation faits. Porte, audit DX et banc : voir
« Preuves ». Rien n'est poussé ni fusionné.

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

## Approches rejetées

- Indices par post-traitement des messages d'erreur dans Yoga : il aurait
  fallu exposer la table des indices ; la règle de validation partagée suffit.
- Extraction des imports d'esm.sh par expression régulière : elle suivait des
  `import` écrits dans des chaînes (sources de workers) ; `es-module-lexer`
  lit les vraies instructions.

## Preuves

(complétées après la porte)

## Prochaine action vérifiable

Relecture du coordinateur, décisions de l'utilisateur sur les points
ci-dessus, puis fusion `--no-ff` dans `main` ; supprimer ce handoff après la
fusion.
