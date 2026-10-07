# ADR-0149: Explicit operation cardinality names

- Status: accepted
- Date: 2026-08-06
- Refines: ADR-0109, ADR-0132, ADR-0148

## Context

The collection API mixed concise singular names with explicit cardinality.
Generated schema classes exposed `create` beside `createMany` and `upsert`
beside `upsertMany`, while Query exposed `first` beside `find`. The resulting
vocabulary made related operations harder to scan and left transports, hooks,
logs, and adapter discriminants using different words for the same cardinality.

UltimaBase already treats singular and collection operations as distinct
contracts. They have different result shapes, targeting rules, hook behavior,
and Operation AST nodes. Their names should expose that distinction directly.

## Decision

Schema-level commands use explicit cardinality consistently:

- `createOne` and `createMany`;
- `updateOne` and `updateMany`;
- `upsertOne` and `upsertMany`;
- `deleteOne` and `deleteMany`.

Read terminals use `findOne` and `findMany`. `findOne` returns the first visible
match or `null`; `findMany` returns every visible match within the Query's
ordering and pagination. `get(id)` remains a distinct identifier shortcut, and
`count` plus `exists` keep their cardinality-independent names.

The Operation AST uses the matching `find-one` and `find-many` discriminants.
The exported types are `FindOneOperationAst` and `FindManyOperationAst`.
Runtime hooks, Access, adapters, diagnostics, and transports observe those same
discriminants.

This is a hard pre-release migration. The former `create`, `upsert`, `first`,
and `find` collection methods and their former read AST names are removed
without aliases.

Immutable model instance commands remain concise: a draft still exposes
`create()` and `upsert()`, while a persisted model exposes `update()` and
`delete()`. The receiver already identifies exactly one object, so adding
`One` there would not clarify cardinality.

## Consequences

- Autocomplete groups every collection command into visible `One` and `Many`
  pairs.
- Public methods, Operation AST kinds, hooks, Access, logs, and adapters share
  one vocabulary.
- Transports can map singular and collection operations without translating
  `first` into an unrelated internal name.
- Existing schema and Query calls must migrate atomically to the new names.
- Instance commands remain natural without creating aliases on collection APIs.
