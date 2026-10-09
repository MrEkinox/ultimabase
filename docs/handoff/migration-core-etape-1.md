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

- Installation et construction faites.
- Point de contrôle 1 (ADR-0302 erreurs, ADR-0300, ADR-0299) :
  - Core : codes `UNIQUE_VIOLATION`, `REFERENCE_VIOLATION`,
    `TRANSACTION_CONFLICT` ; `runAutomaticRequestTransaction` (3 essais,
    attente aléatoire, journal debug/warn) branché sur les mutations, les
    commandes de collection, les mutations de schéma, les opérations de plugin
    `transaction: 'required'` et le stockage privé ; `transaction()` explicite
    inchangé.
  - PostgreSQL : 23505/23503/40001/40P01 mappés (catalogue de contraintes en
    noms logiques, stockage privé inclus) ; COMMIT en 40001/40P01 →
    `TRANSACTION_CONFLICT`.
  - Password Auth : doublon détecté par `UNIQUE_VIOLATION` sur l'index
    `username` du schéma User uniquement.
  - REST : 409 pour les trois nouveaux codes.
  - Tests : `packages/core/tests/runtime/automatic-transaction-retries.test.ts`,
    `tests/e2e/referential-integrity.postgres.e2e.test.ts` (12 cas, dont
    concurrence dans les deux ordres pour restrict/cascade/setNull),
    `tests/e2e/storage-semantics.postgres.e2e.test.ts` (NULL multiples, nulls
    en dernier, égalité de liste, décimal exact, interblocage résolu par
    rejeu).
  - Preuves : `yarn vitest run --project unit packages/core
    packages/password-auth-plugin packages/rest-plugin` → 239 fichiers, 1447
    tests verts ; `--project postgres-e2e` sur les deux nouveaux fichiers et
    `private-storage-postgres` → verts.
- Reste : ADR-0301, ADR-0303, documentation (READMEs Core/PostgreSQL, site),
  porte complète.

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

## Tentatives écartées

(aucune)

## Prochaine action vérifiable

ADR-0302 (codes d'erreur) puis ADR-0300 : tests ciblés verts.
