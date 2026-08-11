# 1301: Remove unused Query mutation execution helpers

- Status: ready
- Milestone: 13
- Packages: `@ultimabase/core`
- Depends on: 1211
- ADR: ADR-0132, ADR-0164

## Goal

Remove four unreachable internal Query mutation execution helpers and their
dead-only dependencies without changing schema-owned collection commands or
the low-level operation and adapter contracts they use.

## Acceptance criteria

- [ ] `executeSchemaCreateMany`, `executeQueryUpdateMany`, `executeSchemaUpsertMany`, and `executeQueryDeleteMany` have no caller before removal.
- [ ] The four helpers and imports used only by them are removed from `query/query/query.ts`.
- [ ] Generated schema `createMany`, `updateMany`, `upsertMany`, and `deleteMany` continue to normalize and execute through `schema-command-execution.ts` and `executeOperationBatch`.
- [ ] Public collection commands remain ordered itemized singular operations inside one automatic transaction.
- [ ] Low-level many-operation AST nodes, adapter support, and internal batch execution remain unchanged.
- [ ] No public QueryBuilder, schema command, operation, result, or package export changes.
- [ ] No compatibility alias, replacement helper, or speculative abstraction is introduced.

## Tests

- [ ] Source regressions prove the removed names have no remaining declaration or reference.
- [ ] Focused schema collection-command tests protect itemization, order, empty batches, missing-target rollback, and exact result inference.
- [ ] Packed Core declarations and public Query tests remain unchanged.
- [ ] Typecheck, lint, formatting, constraints, build, and Changesets validation pass.

## Out of scope

- Removing set-based operation AST or adapter capabilities.
- Changing public collection input or result semantics.
- Splitting QueryBuilder or its execution bridge; issue 1302 owns that work.
