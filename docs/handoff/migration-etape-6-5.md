# Migration, sous-étape 6.5 : PostgreSQL (ADR-0320)

Branche `migration/postgres` (worktree `../ub-step6-5`), basée sur `main`
local 50209ff0 (fusion de 6.1). En parallèle : 6.2 (Hooks et Validation) dans
`../ub-step6-2` ; ce travail ne touche pas `packages/hooks-plugin` ni
`packages/validation-plugin`.

## Portée (ADR-0320, décisions 1 à 8 et conséquences)

1. Renommage oublié : refus au `start()` (politique `override`) d'une colonne
   non gérée `NOT NULL` sans défaut ; suggestion de `renamedFrom`.
2. Conversions de type : seuls les élargissements s'appliquent ; les autres
   sont refusées avec renvoi vers une migration.
3. Journal : une ligne `info` par changement appliqué.
4. `connection: { max, ssl, statementTimeoutMs, idleTimeoutMs, connectRetries }`
   en mode URL (`url` ou `DATABASE_URL`).
5. Colonnes en `snake_case` par défaut.
6. `debug: { logQueries, slowQueryMs }` sans valeurs.
7. `.with({ postgres: { table } })` par l'emplacement `SchemaRulesHKT` ; fin de
   l'usage des gabarits par PostgreSQL.
8. Documentation du comportement gardé.

Hors portée : pg-vector (doit seulement compiler et passer ses tests),
décisions des autres revues, répliques, plugin de migrations.

Critère de fin : porte complète sur le dernier commit de code
(`yarn validate:full`, `yarn test:e2e:built`, `yarn website:test`), audit DX
expliqué, banc forme D TS6/TS7.

## État

Fait (commits `wip(postgres)` cff41b9f..748b7273, dernier commit de code
748b7273) :

- Colonnes `snake_case` (`naming.ts`, compilateurs de champs, de schémas,
  d'index, stockage privé) ; correspondance colonne → champ pour les erreurs
  d'unicité et de référence (`catalog.ts`) et pour la cible d'un `upsert`
  (`operation-executor.ts`).
- Synchronisation sûre (`synchronization/safety.ts`, `preparer.ts`) :
  colonnes non gérées, suggestion de `renamedFrom`, élargissements, journal.
- `connection` (`plugin/plugin-options.ts`, `connection/settings.ts`),
  nouvelles tentatives (`managed-connection.ts`), `debug`
  (`connection/query-log.ts`).
- `.with({ postgres })` : `PostgresRules`, `PostgresSchemaRules` ; source
  `never` de l'option de schéma ; Core : une option dont la source est `never`
  ne projette plus de gabarit vide (`schema-declaration-contracts.ts`), si bien
  que `schemaOptions` vaut `never` sans ACL (Access, Hooks, PostgreSQL).
- Tests : unitaires (`safety`, `preparer`, `query-log`, `managed-connection`,
  `plugin-options`), types (`options.test-d.ts`, `postgres-plugin.test-d.ts`,
  test Core), Testcontainers (`postgres-safe-sync`,
  `postgres-connection-settings`), déclarations publiées sans `pg` ni Node
  (`postgres-declarations.e2e`).
- Documentation : README du paquet, page du site PostgreSQL, liste de contrôle
  de déploiement, concept `postgres-migrations.md`, index des ADR.

## Décisions prises (non fixées par l'ADR, à confirmer)

- `renamedFrom` nomme l'ancienne colonne physique (comme avant) ; la
  vérification « ne doit pas être un champ déclaré » compare désormais aux
  colonnes physiques déclarées, donc `renamedFrom: 'publishedAt'` sur le champ
  `publishedAt` (colonne `published_at`) est permis : c'est le chemin d'une
  base camelCase existante.
- `snake_case` : `createdAt` → `created_at`, `userID` → `user_id`,
  `URLValue` → `url_value` (expression régulière propre, pas `underscore`
  d'`inflection` qui donne `user_i_d`) ; deux champs qui donnent la même
  colonne sont refusés à la compilation. Noms d'index et de clés étrangères
  calculés sur les colonnes physiques ; tables de jointure et noms de tables
  inchangés. Les tables privées (stockage de plugin) suivent la même règle.
- Renommage oublié : vérifié à chaque `start()` en `override`, même sans
  autre changement ; une colonne optionnelle orpheline avec un champ ajouté du
  même type donne un `warn` (pas de refus). `fail` et `ignore` ne vérifient
  pas (l'ADR vise `override`).
- Élargissements admis : `numeric` plus large ou sans contrainte, `bigint` vers
  un `numeric` qui le contient, `time`/`timestamp` plus précis de même fuseau.
  Tout le reste (dont `double precision` → `text`) est refusé.
- Ordre des refus en `override` : colonnes non gérées, structures non prises en
  charge, conversions refusées.
- Ligne du journal : `schema change applied: <description>` après le `COMMIT`.
- `connection` refusé avec `pool` (type `never`, `TypeError` en JavaScript).
  `ssl` : `boolean | { rejectUnauthorized, ca, cert, key }` ; `sslmode` dans
  l'URL l'emporte (comportement de `pg`). Délais de `connectRetries` : 0,5 s,
  1 s, 2 s, 4 s puis 8 s ; chaque échec donne une ligne `warn` avec le code du
  pilote seulement ; toutes les erreurs sont retentées.
- `debug.logQueries` : ligne `info` par requête ; `slowQueryMs` : ligne `warn`
  (une requête lente n'est journalisée qu'une fois) ; texte SQL avec
  marqueurs `$n`, espaces compactés ; l'échec ajoute `(failed, SQLSTATE)`.
  `debug` vaut pour tous les modes (y compris `pool`).
- Ancienne forme `define({ postgres: { table } })` : l'option reste déclarée à
  l'exécution (normalisation, provenance) et typée par Typegen
  (`typegen.type: 'PostgresSchemaOption'` gardé) jusqu'à 6.8 ; sans Typegen
  seule `.with({ postgres })` est typée. La définition d'option a la source
  `never`, comme `hooks`.

## Approches rejetées

- Types d'options importés de `pg` (`PoolConfig`) et de plugin-kit dans le
  module des types publics : les déclarations publiées gagnaient `import "pg"`
  et chargeaient `@types/pg` et les globales Node chez tout consommateur (vu
  par l'audit DX : 48 survols de statiques d'`Error`). Types publics déplacés
  dans `connection/settings.ts`, sans import.
- Alias `SchemaOptionTemplate` dans la branche vraie de la projection : les
  survols montraient `SchemaOptionTemplate<{ … définitions … }>` au lieu des
  noms d'options ; le gabarit reste écrit en entier.
- `getColumns(table)` pour retrouver les colonnes par clé logique : un champ
  `__proto__` corrompt les clés Drizzle ; on garde `getTableConfig(table).columns`
  indexé par nom physique (et son évaluation immédiate des index).

## Preuves (porte finale sur 748b7273)

- `packages/*/dist` et `*.tsbuildinfo` hors `node_modules` supprimés, puis
  `yarn validate:full` : code 0. « All matched files use Prettier code
  style! » ; lint 0 erreur (49 + 19 + 2 avertissements ; seul fichier touché
  concerné : `schema-declaration-contracts.ts` 409 → 422 lignes, déjà au-dessus
  de 400) ; performance « Test Files 3 passed (3) / Tests 4 passed (4) » ;
  couverture « Test Files 708 passed (708) / Tests 3489 passed (3489) / Type
  Errors no errors », All files 92,67 / 86,45 / 97,31 / 93,33 ; site « Test
  Files 17 passed (17) / Tests 66 passed (66) ».
- Deux premières tentatives de `validate:full` en échec sur des budgets de
  performance (`hybrid-authoring` 1 260 ms contre 423, puis
  `typegen-editor` hors délai de 60 s) pendant que la porte de 6.2 tournait
  (charge 9 à 21) ; `hybrid-authoring` seul : vert ; troisième tentative et
  porte finale vertes.
- `yarn test:e2e:built` : avec les ouvriers par défaut, seul
  `create-app-packed` dépasse 120 s sous la charge du lancement complet ; seul
  il passe en 52,8 s (base 50209ff0 : 53,6 s). `yarn test:e2e:built
--maxWorkers=4` : code 0, « Test Files 126 passed (126) / Tests 543 passed
  (543) ».
- `yarn website:test` : code 0, « Test Files 8 passed (8) / Tests 59 passed
  (59) ».

### Audit DX (`--only` 23 paquets, `tests`, `examples/minimal`, `examples/todo-backend`)

207 différences (37 637 / 37 757 enregistrements) :

| Cause                                                                                                                                                                                                                                                                                  | Nombre |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -----: |
| Surface publique PostgreSQL : 6 exports de types (`PostgresCommonOptions`, `PostgresConnectionOptions`, `PostgresDebugOptions`, `PostgresSslOptions`, `PostgresRules`, `PostgresSchemaRules`), options `connection`/`debug`, `source: PostgresSource`, JSDoc de `postgresSchemaOption` |     51 |
| Tests de types et fixtures modifiés ou ajoutés (`options.test-d.ts`, `postgres-plugin.test-d.ts`, `schema-declarations.test-d.ts`, `postgres-direct-options.e2e`)                                                                                                                      |    108 |
| État de source : `schemaOptions: Readonly<…>` → `never` dans les survols d'applications sans ACL                                                                                                                                                                                       |     37 |
| Déclarations Core : `SchemaOptionSourceProjection` et alias de morceaux renumérotés                                                                                                                                                                                                    |      5 |
| Forme D `typos.ts` : `PostgresRules` entre dans l'intersection de `.with` (`… 4 more …`) ; ordre des clés Access dans un diagnostic et deux survols de `access-registered-rule-keys`                                                                                                   |      6 |

La fixture Typegen reproduite statiquement par l'audit (contenu généré absent)
gagne une erreur TS2345 : sans Typegen, `define({ postgres })` n'est plus
typé ; le test réel (avec le contenu généré) reste sans diagnostic.

### Banc forme D (base 50209ff0, branche 748b7273 ; alterné, médianes)

TypeScript 6.0.3 (3 exécutions) :

| N   | Arbre   | Charges     | Éd.→diag (s) | Exécutions     | Froid (s) | Schéma (s) | Tas (Mio) | Hover `q0` |
| --- | ------- | ----------- | -----------: | -------------- | --------: | ---------: | --------: | ---------: |
| 50  | base    | 3,9 5,2 5,2 |         2,18 | 2,20/2,16/2,18 |      5,13 |       2,22 |       848 |        199 |
| 50  | branche | 4,8 5,4 5,0 |         2,08 | 2,21/2,06/2,08 |      5,04 |       2,16 |       860 |        199 |
| 200 | base    | 4,9 4,8 4,6 |         7,31 | 7,31/7,36/7,24 |     17,66 |       7,33 |     2 552 |        199 |
| 200 | branche | 5,3 4,3 3,8 |         6,63 | 6,63/6,97/6,61 |     17,14 |       6,60 |     2 419 |        199 |

TypeScript 7.0.2 (`lsp-bench.mjs`, 3 exécutions à 50, 2 à 200) : éd.→diag
50 : 0,71 → 0,68 ; 200 : 2,33 → 2,29 ; premier diagnostic 50 : 0,80 → 0,78 ;
200 : 2,48 → 2,39 ; RSS serveur 635 → 715 Mio (50), 1 705 → 1 860 Mio (200).
`tsc --extendedDiagnostics` à 50 : 2 406 202 → 2 271 025 instanciations
(−5,6 %), vérification 4,11 → 3,97 s.

Lecture : gain partiel attendu (−5 % à 50, −9 % à 200 en TS6) ; le reste du
gain du spike (2,05 → 1,72 s) attend ACL (6.3), dont le gabarit est le
dernier de l'application du banc. Les dossiers `gen/` et le worktree de base
sont supprimés.

## Reporté

- `examples/todo-backend` et les tests d'autres paquets (ACL, Validation,
  REST, racine) gardent `define({ postgres: { table } })` (ancienne forme,
  typée par Typegen ou le fixture `plugin-options.d.ts`) : à passer en forme D
  avec leur sous-étape (6.3, 6.2, 6.6, 6.7) ou au retrait de l'ancienne forme
  (6.8).
- README PostgreSQL : l'exemple Hooks garde `context.emit('audit.created', …)`
  (événement chaîne remplacé en 6.2) ; le coordinateur le corrige après les
  deux fusions.

## Prochaine action vérifiable

Revue du coordinateur, décisions de l'utilisateur sur les points non fixés
par l'ADR, puis fusion `--no-ff` dans `main` ; supprimer ce handoff après la
fusion.
