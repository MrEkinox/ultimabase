# 1301: Remove unused Query mutation execution helpers

- Status: done
- Milestone: 13
- Packages: `@ultimabase/core`
- Depends on: 1211
- ADR: ADR-0132, ADR-0164

## Goal

Remove four unreachable internal Query mutation execution helpers and their
dead-only dependencies without changing schema-owned collection commands or
the low-level operation and adapter contracts they use.

## Acceptance criteria

- [x] `executeSchemaCreateMany`, `executeQueryUpdateMany`, `executeSchemaUpsertMany`, and `executeQueryDeleteMany` have no caller before removal.
- [x] The four helpers and imports used only by them are removed from `query/query/query.ts`.
- [x] Generated schema `createMany`, `updateMany`, `upsertMany`, and `deleteMany` continue to normalize and execute through `schema-command-execution.ts` and `executeOperationBatch`.
- [x] Public collection commands remain ordered itemized singular operations inside one automatic transaction.
- [x] Low-level many-operation AST nodes, adapter support, and internal batch execution remain unchanged.
- [x] No public QueryBuilder, schema command, operation, result, or package export changes.
- [x] No compatibility alias, replacement helper, or speculative abstraction is introduced.

## Tests

- [x] Source regressions prove the removed names have no remaining declaration or reference.
- [x] Focused schema collection-command tests protect itemization, order, empty batches, missing-target rollback, and exact result inference.
- [x] Packed Core declarations and public Query tests remain unchanged.
- [x] Typecheck, lint, formatting, constraints, build, and Changesets validation pass.

## Validation evidence

- Repository-wide reference inspection found each removed symbol only at its
  own declaration before implementation. None was exported by Core's public
  Query barrel or present in the built JavaScript and declarations.
- `query/query/query.ts` decreases from 1,154 to 1,056 lines. The four helpers,
  four many-operation type imports, and create/upsert-many-only normalizer and
  input imports are removed without adding a replacement path.
- `schema-command-execution.ts` retains its four `executeOperationBatch` call
  sites for create, update, upsert, and delete collections. Operation ASTs,
  Runtime batching, automatic transactions, and adapter contracts are
  untouched.
- A colocated type regression proves the removed names cannot be imported from
  the internal source module. The packed archive suite proves the names are
  absent even from the built Core implementation source map.
- Focused Query, schema-command, itemized-bulk, transaction, and public-type
  validation passes with 6 files and 41 tests. Repository unit and type suites
  pass with 287 files and 1,814 tests and no type errors.
- Packed-package validation passes with 7 files and 48 tests. Constraints,
  typecheck, lint, formatting, build, and Changesets validation pass.
- The touched production assertion count remains unchanged and no `any`, deep
  import, public export, or speculative extension is introduced.

## Out of scope

- Removing set-based operation AST or adapter capabilities.
- Changing public collection input or result semantics.
- Splitting QueryBuilder or its execution bridge; issue 1302 owns that work.
