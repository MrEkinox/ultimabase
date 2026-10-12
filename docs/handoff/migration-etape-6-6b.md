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

Implémentation, tests ciblés, documentation faits (commits `wip(rest)`).
Reste : suites complètes, porte finale, audit DX, banc.

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

(à compléter : porte finale)

## Prochaine action vérifiable

Suites complètes (`yarn test`, e2e PostgreSQL), puis porte finale.
