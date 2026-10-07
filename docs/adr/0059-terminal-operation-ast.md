# ADR-0059: Terminal Operation AST

- Status: accepted
- Date: 2026-07-31
- Refines: ADR-0004, ADR-0013, ADR-0019, ADR-0052

## Decision

`@ultimabase/query` represents terminal intent with one transport-neutral
`OperationAst` discriminated union. Its exact kinds are `find`, `first`, `get`,
`count`, `exists`, `create-one`, `create-many`, `update-one`, `update-many`,
`upsert-one`, `upsert-many`, `delete-one`, and `delete-many`.

Read, update, and delete operations retain the complete Query AST. `get` also
carries the schema-derived object identifier while preserving the Query's
selection and filters. Create operations carry the exact schema reference and
`InferCreateInput<TSchema>` values because they do not have a target query.

Update operations carry an `UpdateExpressionNode`, never a create input or a
replacement object. The neutral node deliberately leaves concrete `set`,
`unset`, `increment`, and `decrement` expressions to their dedicated capability.
Upsert operations keep the unique target query, create input, and update
expression separate. Bulk upsert items each retain their own query and remain
ordered; the operation also retains its schema so an empty batch is still typed.

Bulk create and bulk upsert carry `AtomicBulkOperationOptions` with exactly one
recognized behavior: `atomic`. No operation or operation option contains
`useMasterKey`, an access mode, a master key, or trusted capabilities. Authority
is supplied only by Runtime's separately constructed request context and cannot
be derived from a transport-normalized operation.

The operation contracts retain typed values but do not claim those values have
already passed structural validation or been snapshotted. Runtime owns that
boundary so REST, GraphQL, jobs, and direct TypeScript terminals share the same
validation path.

## Consequences

Runtime, hooks, permissions, and adapters can exhaustively match every terminal
operation. Singular and bulk behavior cannot be confused through flags, and
bulk atomic behavior is explicit after normalization.

The next update-operator capability can specialize the generic expression node
without changing create contracts. Later terminal methods construct these
operations without embedding execution state, database expressions, transport
objects, or authority in the AST.
