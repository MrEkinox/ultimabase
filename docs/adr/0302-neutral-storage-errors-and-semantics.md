# ADR-0302: Neutral storage errors and written storage semantics

- Status: accepted
- Date: 2026-10-09
- Refines: ADR-0042, ADR-0133 (canonical null), ADR-0278; applies ADR-0288
- Approval: decided by the user on 2026-10-09 in the plugin review
  (`docs/handoff/revue-plugins/adaptateurs.md`, point 4); record accepted by the user on 2026-10-09
- Evidence: `docs/handoff/audit-adaptateurs-base.md`, sections 3, 4, 6 and 7 (`main` 116cf14e)

## Context

PostgreSQL maps every data exception and integrity violation (SQLSTATE classes 22 and 23) to
`VALIDATION_ERROR` (`packages/postgres-plugin/src/drizzle/operation-error.ts`), and Password Auth
treats any `VALIDATION_ERROR` during sign-up as a duplicate identifier
(`packages/password-auth-plugin/src/operation-handlers.ts`, `isValidationFailure`). Several
semantics exist only as PostgreSQL behaviour: several `NULL`s in a unique index, `NULLS LAST`
(`packages/postgres-plugin/src/query/clause-compiler.ts`), the ARE regular-expression dialect,
whole-value list equality, `READ COMMITTED` with `SELECT … FOR UPDATE` targets
(`packages/postgres-plugin/src/drizzle/operation-executor.ts`) and `numeric` decimals.

## Decision

**Errors.** Three framework codes are added (ADR-0042 allows additions); every adapter produces
them, private storage included:

- `UNIQUE_VIOLATION`: a write would duplicate a unique index (field, schema or partial index).
  `publicDetails: { schema, fields }` lists the index fields, never the values.
- `REFERENCE_VIOLATION`: referential integrity, ADR-0299.
- `TRANSACTION_CONFLICT`: transient conflict, `retryable: true`, ADR-0300.

Other rejections stay `VALIDATION_ERROR`. Password Auth detects a duplicate identifier by
`UNIQUE_VIOLATION` on its identifier index only.

**Semantics every adapter guarantees:**

1. **Unique and null.** A row with `null` in any indexed field never conflicts; several `null`s are
   allowed. A partial unique index (ADR-0303) applies only to the rows its `where` matches.
2. **Null ordering.** `null` sorts last in ascending and descending order (current behaviour);
   cursor pagination follows the same order.
3. **Regular expressions.** One portable subset: literals, `.`, bracket classes with ranges and
   negation, `\d \w \s` and their negations, anchors `^` and `$`, groups, alternation, quantifiers
   `* + ? {m} {m,} {m,n}`, and the three existing flags. Core validates each pattern and rejects
   anything else (backreferences, lookaround, named groups, Unicode properties) with
   `VALIDATION_ERROR` before the adapter.
4. **List equality.** Equality on a list field or a JSON array compares the whole value (length,
   elements, order); no implicit element match. Membership uses the list operators
   (`list-has`, `list-has-some`, `list-has-every`).
5. **Minimum isolation.** No dirty reads: each statement sees committed data and its own
   transaction's writes. The target of an update, delete or upsert stays stable from loading (item
   Access, hooks) to commit, by lock or by a conflict reported as `TRANSACTION_CONFLICT`. Atomic
   updates (`increment`) never lose a concurrent update. Serializability is not promised: write
   skew across different rows remains possible and is documented.
6. **Decimals.** Values are exact decimal strings. Core already validates declared precision and
   scale (`packages/core/src/schema/plans/scalar-shape-validation.ts`); adapters store and return
   them exactly, never through floating point. An adapter that cannot hold a declared precision, or
   an undeclared (unbounded) one, refuses to start and names the field.

## Consequences

- PostgreSQL maps 23505, 23503, 40001 and 40P01 to the new codes. Transports map them to client
  statuses (REST 409 proposed) in their migration.
- Soft Delete's restore-conflict message (its review, decision 9) builds on `UNIQUE_VIOLATION`.
- Tests: one conformance test per semantic on PostgreSQL (moved into the adapter suite later), the
  regex-subset validator, Password Auth duplicate sign-up without PostgreSQL error classes.
- Documentation impact: both (filters, sorting, transactions, errors).

## Out of scope

String collation and case-insensitive ordering (adapter-defined and documented, decided with
MongoDB), `autoIncrement` portability, time-zone and JSON-key restrictions, transport status codes.
