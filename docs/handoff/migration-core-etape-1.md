# Migration de Core, étape 1 : contrats d'adaptateur (ADR-0299 à 0303)

Branche `migration/adapter-contracts` (worktree `../ub-step1`), basée sur
`main` local f631f8fe (forme D, étape 0). Plan d'ensemble :
`docs/handoff/migration-core.md` sur la branche `api-challenge`.

## Périmètre

ADR acceptés, copiés dans `docs/adr/` au fil de l'implémentation :

- ADR-0299 : intégrité référentielle garantie par l'adaptateur (contrat écrit
  dans Core, clés étrangères PostgreSQL, `REFERENCE_VIOLATION`).
- ADR-0300 : nouvelles tentatives bornées (3) des transactions automatiques sur
  `TRANSACTION_CONFLICT` ; `transaction()` explicite jamais rejouée.
- ADR-0301 : opérateurs de filtre déclarés par l'adaptateur ; retrait de
  `jsonPathExists`, `jsonPathMatches`, `containedBy` partout.
- ADR-0302 : erreurs neutres (`UNIQUE_VIOLATION`, `REFERENCE_VIOLATION`,
  `TRANSACTION_CONFLICT`) et sémantique de stockage écrite.
- ADR-0303 : index partiels dans Core et `ultimabase.health()` (pas la route
  HTTP ni le champ GraphQL).

## État

Étape 1 terminée sur la branche (dernier commit de code d8912f35), à relire
par le coordinateur.

- ADR-0299, 0300, 0302 : codes neutres, catalogue de contraintes PostgreSQL,
  nouvelles tentatives des transactions automatiques (mutations, commandes de
  collection, mutations de schéma, opérations de plugin `required`, stockage
  privé), Password Auth sans classes d'erreurs PostgreSQL, REST 409.
- ADR-0301 : opérateurs retirés (Core, REST, GraphQL, Typegen, exemples
  régénérés), capacité `filterOperators`, contrôle à la requête et au
  démarrage, sous-ensemble regex portable (ADR-0302).
- ADR-0303 : index partiels (`indexes` du `.with` final typés par
  `SchemaRuleIndexOptions`, `indexes` de `define` inchangés en type),
  compilation et synchronisation PostgreSQL, `ultimabase.health()` et
  `checkHealth` requis.
- Documentation : READMEs Core, PostgreSQL, Hooks, REST, Soft Delete,
  `packages/core/docs/schema.md`, `docs/concepts/query-runtime.md`, 13 pages
  du site.

Preuves (sur `dist` et `*.tsbuildinfo` nettoyés) :

- `yarn validate:full` : exit 0 ; couverture 657 fichiers, 3151 tests ;
  website 17 fichiers, 66 tests ; lint 0 erreur.
- `yarn test:e2e:built` : exit 0, 107 fichiers, 438 tests.
- Après le dernier changement de types (d8912f35) : `yarn typecheck` vert,
  `vitest --project unit --project types packages/core
packages/soft-delete-plugin` : 292 fichiers, 1500 tests, aucune erreur de
  type.
- Audit DX contre `main` construit (f631f8fe), `--only` tous les paquets,
  `tests`, `examples/minimal`, `examples/todo-backend` (l'exemple
  `schema-form-d` fait planter l'outil : clé dupliquée `ACLContainmentOperand`
  dans `usage.ts`, présent des deux côtés) : 385 différences, toutes
  rattachées à ADR-0299 à 0303 ou à des fichiers de test nouveaux/modifiés.
- Banc forme D (TS6, même session) : 50 schémas, édition→diagnostic 2,81 s
  (main) / 2,83 s ; froid 6,01 / 6,06 s ; 200 schémas, édition 8,61 / 8,63 s ;
  froid 22,50 / 22,49 s. Aucune régression mesurable.

## Décisions

- REST renvoie 409 pour `UNIQUE_VIOLATION`, `REFERENCE_VIOLATION` et
  `TRANSACTION_CONFLICT` (« REST 409 proposé » par ADR-0302) : sinon un
  doublon passait de 422 à 500. À valider par le coordinateur.
- `UNIQUE_VIOLATION` du stockage privé n'a pas de `publicDetails` (les
  collections privées ne sont pas des schémas publics) ; collection et
  champs restent en détails internes.
- Message public de `REFERENCE_VIOLATION` : distingue suppression (« cannot be
  deleted while other objects reference it ») et écriture (« references an
  object that does not exist »), ne nomme que le schéma de l'opération.
- Après annulation, la nouvelle tentative n'a pas lieu et l'appelant reçoit
  le dernier `TRANSACTION_CONFLICT` (pas `OPERATION_CANCELLED`).
- Une écriture `connect` vers une ligne absente échoue en `NOT_FOUND` (contrôle
  de Core) avant l'adaptateur ; `REFERENCE_VIOLATION` ne survient qu'en
  concurrence.
- Password Auth garde le rejet opaque d'inscription pour `VALIDATION_ERROR`
  (données invalides) et l'ajoute pour `UNIQUE_VIOLATION` de l'index
  `username` ; un autre index unique se propage.
- Une absence totale de `filterOperators` vaut « aucun opérateur » ; les faux
  adaptateurs déclarent leur table (`tooling/vitest/database-filter-operators.ts`).
- Contrôle de démarrage des champs relation : `relations` et
  `relationPredicates` exigés (lecture littérale d'ADR-0301).
- `COMMIT` en 40001/40P01 devient `TRANSACTION_CONFLICT` (rollback garanti par
  PostgreSQL), donc rejoué pour les transactions automatiques.
- Les index d'un `define` gardent leur type (prédicat limité aux champs
  système) ; les index partiels sur tout le schéma passent par le `.with`
  final (`SchemaRuleIndexOptions`), pour ne pas allonger les diagnostics de
  l'ancienne forme.
- Nom physique d'un index partiel haché avec son prédicat : un prédicat modifié
  remplace l'index sous `override`.

## Tentatives écartées

- GraphQL limité aux opérateurs déclarés (ADR-0301, décision 5) : le schéma
  GraphQL est compilé pendant la matérialisation des capacités, avant que
  l'adaptateur soit lisible (« Application capabilities require completed
  materialization ») et avant la liaison de l'exécuteur de requêtes
  (« Application request executor is not bound »). Deux variantes essayées
  (méthode sur l'exécuteur, lecture par le planificateur) : la première échoue
  à l'exécution ; la seconde, examinée dans le code de l'hôte de capacités,
  se heurte au même refus avant la fin de la matérialisation. Reporté : il faut une
  déclaration statique (durée de vie `declaration`) des opérateurs ou une
  compilation GraphQL après matérialisation — changement d'architecture hors
  périmètre. PostgreSQL déclarant tous les opérateurs restants, le schéma
  GraphQL reste exact pour lui ; tout opérateur non déclaré échoue en
  `VALIDATION_ERROR` à la requête (REST et GraphQL).

## Prochaine action vérifiable

Relecture du diff par le coordinateur, puis fusion `--no-ff` dans `main` après
validation de l'utilisateur ; décider du report GraphQL (ADR-0301, décision 5).
