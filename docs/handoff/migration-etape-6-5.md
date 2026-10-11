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

En cours (commits `wip(postgres)`).

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

- `getColumns(table)` pour retrouver les colonnes par clé logique : un champ
  `__proto__` corrompt les clés Drizzle ; on garde `getTableConfig(table).columns`
  indexé par nom physique (et son évaluation immédiate des index).

## Preuves

À compléter.

## Prochaine action vérifiable

Corriger les assertions SQL `camelCase` des tests e2e PostgreSQL, ajouter les
tests Testcontainers (réglages, tentatives, journaux), documentation.
