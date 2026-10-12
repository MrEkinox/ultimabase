# Migration, sous-étape 6.6b : REST (ADR-0324)

Branche `migration/rest` (worktree `../ub-step6-6b`), basée sur `main` local
4a81b6c6 (fusion de 6.6a). GraphQL, l'explorateur et le preset sont 6.6c.

## Portée

ADR-0324, décisions 1 à 8 et conséquences :

1. Préfixe `/api` sans version, en-tête `X-UltimaBase-Rest-Version`.
2. `.with({ rest: { … } })` par les noms de méthodes (commandes de plugin
   comprises), hors des gabarits ; liaison automatique de 6.0 retirée pour
   REST (gardée pour GraphQL jusqu'à 6.6c).
3. `publicWrites` (ADR-0294), `acknowledgeUnverifiedProtection` retiré.
4. Erreurs détaillées `details: { parameter, path, reason }` et 405.
5. Opérations publiques déclarées par leur propriétaire (F1) et `hide`.
6. `defineOperation({ name, input, output, handler })`.
7. `restPlugin({ openapi: true })` et `/api/openapi.json`.
8. Comportement gardé.

Critère de fin : porte complète sur le dernier commit de code
(`yarn validate:full`, `yarn test:e2e:built`, `yarn website:test`), audit DX
expliqué, banc forme D TS6/TS7.

## État

Implémentation, tests, documentation, porte finale, audit DX et banc faits.
Dernier commit de code : 876e7236. Rien n'est poussé ni fusionné.

### Core (générique, aucun plugin nommé)

- `contributeOperation({ …, public: { name, input?, output? } })`
  (`PluginOperationPublicDeclaration`, exporté par `@ultimabase/core/plugin`) ;
  nom camelCase unique dans l'application (`bindPublic` dans
  `runtime/commands/bindings.ts`, lié avant les fabriques de capacités) ;
  privilège `transport:expose` dérivé.
- `runtime/commands/default-transports.ts` : liaison par défaut d'une
  opération publique ou d'une commande `request`/`one` sans liaison pour un
  protocole (le contrat d'entrée de la commande valide ; rejet =
  `VALIDATION_ERROR`, issue `['input']`).
- Planificateur : `plan({ transport })` sans `operations` = opérations
  publiques ; `planSchemaMutations({ transport, bindings: 'optional' })` et
  `exposeSchemaMutations({ …, bindings: 'optional' })` ; descripteurs `bound`
  (et `public` pour les opérations).
- `ApplicationRequestExecutor.hasProtectedPolicy()`.
- `path` dans les entrées des transformateurs `transformQueryFilterInput` et
  `transformSchemaMutationDataInput` (localisation des erreurs).

### plugin-kit

- Liaison REST TEMPORAIRE de 6.0 retirée de `define-plugin/commands.ts`
  (GraphQL la garde jusqu'à 6.6c, commentaire TEMPORARY mis à jour).
- `defineOperation` (`define-operation.ts`) : plugin `application.operations`
  (instance = nom), opération `application.<kebab>`, déclarée publique, schémas
  JSON des validateurs Standard JSON Schema, validation asynchrone dans le
  gestionnaire.

### REST

- Options : `basePath` (`/api`), `bodyLimit`, `default` (clés de méthode),
  `hide`, `instanceId`, `openapi`, `pagination`, `publicWrites` ;
  `acknowledgeUnverifiedProtection` et `operations` retirés.
- Règle `.with({ rest })` par `SchemaRulesHKT` (`RestSchemaRules`,
  `RestSchemaRule`, `RestCommandName`), source `never` de l'option de schéma
  (hors gabarits) ; l'ancienne forme reste typée par Typegen (`RestSchemaRule`).
- 405 + `Allow` (chemins connus des schémas exposés, commandes exposables
  comprises) ; en-tête de version sur toute réponse REST ;
  `REST_UNSUPPORTED_VERSION` remplacé par `REST_METHOD_NOT_ALLOWED`.
- Détails d'erreur (`RestErrorDetails`, `decodeParameter`, chemins des
  transformateurs Core, vérification du type JSON des scalaires passés tels
  quels).
- OpenAPI : `openapi.ts`, `openapi-schemas.ts`.
- Password Auth déclare ses six opérations publiques
  (`passwordAuthPublicOperations`, schémas JSON d'entrée simples).

## Décisions prises (non fixées par l'ADR, à confirmer)

1. **Déclaration F1 dans Core** (pas plugin-kit) : `public` sur
   `contributeOperation`. Justification : Core possède déjà opérations,
   liaisons, planification et exposition ; GraphQL (6.6c) consommera
   `plan({ transport })` tel quel ; la liaison par défaut évite que plugin-kit
   nomme des protocoles. Core ne connaît aucun transport.
2. **Commandes de plugin** : désactivées par défaut ; exposées si la règle les
   nomme, ou si la règle ou le `default` du plugin vaut `true`.
   `default` (objet) n'accepte que les méthodes natives.
3. **`findOne`** couvre `/{id}` et `/first` ; `…Many` = routes `bulk/*`.
4. **En-tête** `X-UltimaBase-Rest-Version: 1`.
5. **405** : seulement pour un schéma qui a au moins une route ; un schéma
   sans route (ou `rest: false`) reste 404 (ne pas révéler son existence).
   `Allow` peut être vide.
6. **`publicWrites`** : écritures = create/update/delete/upsert/bulk et
   commandes ; les opérations (publiques ou `defineOperation`) ne comptent pas.
   Plus d'avertissement « unverified » pour REST (avec ou sans politique) ;
   REST passe `acknowledgeUnverifiedProtection: true` à Core en interne
   (TEMPORAIRE jusqu'à 6.6c, où GraphQL quitte aussi l'acquittement et Core
   peut le retirer).
7. **Détails** : `path` relatif au paramètre (tableau de segments) ;
   paramètres `query`, `id`, `body`, nom du paramètre ou clé du corps ; une
   erreur vue seulement par Core porte le message de Core et `path: []`
   (le schéma exposé est public).
8. **Erreurs déclarées sans liaison REST** → 400.
9. **Chemin par défaut des opérations** : `/operations/<nom public>` (avant :
   nom namespacé).
10. **Password Auth** : les six opérations publiques (create-app et l'exemple
    minimal masquent `changePassword` et `logoutEverywhere` pour garder la
    même surface).
11. **`defineOperation`** dans plugin-kit (dépend déjà de
    `@standard-schema/spec`), transaction `optional`, entrée `{ input,
context }`, code d'issue `operation.input`, résultat passé par `toJSON`.
12. **OpenAPI** : `info.version: '1'`, `servers: [{ url: basePath }]`,
    contraintes = options de champ implémentant Standard JSON Schema (ex.
    `validation` de Validation) sans que REST connaisse Validation ; validité
    vérifiée structurellement (pas de validateur OpenAPI en dépendance).
13. **`hide`** : jetons d'opération seulement ; un jeton non public échoue au
    démarrage.

## Approches rejetées

- Valider les clés de commande d'une règle dans une fixture interne avec de
  faux descripteurs : la vraie instance REST refuse les commandes inconnues ;
  le test interne utilise des règles booléennes, les clés nommées sont testées
  avec de vraies commandes (`tests/exposure.test.ts`, e2e Soft Delete).

## Preuves

Sur 876e7236, `packages/*/dist` et `*.tsbuildinfo` hors `node_modules`
supprimés :

- `yarn validate:full` → exit 0 : « All matched files use Prettier code
  style! » ; lint 0 erreur (49 + 17 + 2 avertissements, tous de taille de
  fichier et déjà présents sur 4a81b6c6 ; fichiers modifiés concernés :
  `capability-host.ts` 523 → 533, `core/src/plugins/plugin.ts` 437 → 440,
  `optional-product-public-api.ts` 521 → 528) ; performance « Test Files 3
  passed (3) / Tests 4 passed (4) » ; couverture « Test Files 734 passed (734)
  / Tests 3629 passed (3629) / Type Errors no errors », All files 92,5 /
  86,01 / 96,92 / 93,16 ; site « Test Files 17 passed (17) / Tests 66 passed
  (66) ». Une première exécution avait échoué au contrôle Prettier (4
  fichiers), corrigé par 876e7236.
- `yarn test:e2e:built` → exit 0, « Test Files 135 passed (135) / Tests 591
  passed (591) » (aucun échec, `create-app-packed` compris).
- `yarn website:test` → exit 0, « Test Files 8 passed (8) / Tests 59 passed
  (59) ».

### Audit DX (base 4a81b6c6 construite, `--only` les 23 paquets, `tests`, `examples/minimal`, `examples/todo-backend`)

454 différences (39 039 / 39 256 enregistrements), toutes lues :

| Groupe             | Nombre | Cause                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------ | -----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `rest-plugin`      |    348 | Options et règles réécrites (`RestMethodRules`, `RestSchemaRule`, `RestRules`, `RestSchemaRules`, `RestCommandName` dont 53 membres de `String`, `RestErrorDetails`, `details` des trois erreurs, `methodNotAllowed`) ; `RestBulkRoutes`/`RestSchemaRoutes`/`RestSchemaRoutesOption` retirés ; source de `RestPlugin` = `schemaRules` seul (fin du gabarit) ; tests de types et d'IntelliSense réécrits ou ajoutés |
| `core`             |     37 | `PluginOperationPublicDeclaration`, `public` des contributions, `bound`/`public` des descripteurs, `bindings` (planification et exposition, `SchemaMutationTransportExposureOptions` devient une interface), `operations` facultatif, `hasProtectedPolicy`, `path` des transformateurs, noms de morceaux de construction                                                                                           |
| `plugin-kit`       |     30 | `defineOperation`, `DefineOperationOptions`, `OperationHandlerInput`, `ApplicationOperation`                                                                                                                                                                                                                                                                                                                       |
| `examples/minimal` |     35 | `hide` au lieu de `operations` et `acknowledgeUnverifiedProtection` pour REST (décalage des index d'identifiants), `public` du plugin de statut, survols `rest` de l'ancienne forme (`RestMethodRules` nommé)                                                                                                                                                                                                      |
| `tests`            |      6 | Liste des noms retirés de REST dans `optional-product-public-api`                                                                                                                                                                                                                                                                                                                                                  |

### Banc forme D (base 4a81b6c6 contre 876e7236 ; alterné, 3 exécutions, médianes)

L'application du banc n'installe pas REST : aucun gain attendu ni mesuré
(le gain annoncé par l'ADR concerne les applications qui installent REST).

TypeScript 6.0.3 :

| N   | Arbre   | Charges     | Éd.→diag (s) | Exécutions     | Froid (s) | Schéma (s) | Tas (Mio) | Hover |
| --- | ------- | ----------- | -----------: | -------------- | --------: | ---------: | --------: | ----: |
| 50  | base    | 5,5 4,6 4,0 |         1,89 | 1,89/1,91/1,89 |      4,50 |       1,92 |       859 |   199 |
| 50  | branche | 5,1 4,3 4,0 |         1,90 | 1,90/1,93/1,88 |      4,47 |       1,93 |       855 |   199 |
| 200 | base    | 3,8 3,6 3,1 |         6,11 | 6,16/6,06/6,11 |     14,95 |       6,06 |     2 250 |   199 |
| 200 | branche | 3,6 3,3 3,2 |         6,09 | 6,07/6,09/6,11 |     14,81 |       5,99 |     2 242 |   199 |

TypeScript 7.0.2 (`lsp-bench.mjs`, 3 exécutions) : éd.→diag 50 : 634 → 629 ms
(634/621/637 contre 628/635/629) ; 200 : 2 062 → 2 075 ms ; premier
diagnostic 709 → 721 ms (50), 2 215 → 2 218 ms (200) ; RSS 718 → 725 Mio
(50), 1 693 → 1 549 Mio (200). Charges 2,5 à 3,4. Écarts dans le bruit.
Dossiers `gen/` supprimés, worktree de base retiré.

## Prochaine action vérifiable

Relecture du coordinateur, décisions de l'utilisateur sur les points
ci-dessus, puis fusion `--no-ff` dans `main` ; supprimer ce handoff après la
fusion. En 6.6c : GraphQL consomme `plan({ transport })` (opérations
publiques) et les clés `.with({ graphql })`, retirer la liaison GraphQL
TEMPORAIRE de `plugin-kit/src/define-plugin/commands.ts`, puis
l'acquittement de Core (`acknowledgeUnverifiedProtection`, avertissement)
et `passwordAuthOperationList` s'ils n'ont plus d'utilisateur.
