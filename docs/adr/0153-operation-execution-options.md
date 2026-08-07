# ADR-0153: Operation-wide execution options

- Status: accepted
- Date: 2026-08-07
- Supersedes: ADR-0114
- Refines: ADR-0132, ADR-0152

## Context

ADR-0114 introduced one trusted final options argument while reads and writes
were still described as Query terminals. Schema-root object commands now own
both reads and mutations, `QueryBuilder` is a non-executing composition utility,
and pointer, relation, and persisted-model commands share the same execution
boundary. The public `QueryTerminalOptions` name and its bulk variants therefore
attribute operation execution to a Query API that no longer owns it.

Bulk execution also exposes a separate `BulkOperationOptions` containing only
`atomic`, while another family combines that value with authority options. Two
public option models for one final argument make autocomplete and reuse less
clear.

## Decision

Every singular operation accepts `OperationOptions` as its optional final
argument. It contains only `context`, `ultimabase`, and `useMasterKey` and stays
outside Query and Operation ASTs.

Every bulk operation accepts `BulkOperationOptions`, which extends
`OperationOptions` with `atomic?: boolean`. The literal `false` still selects a
stopped-prefix result, `true` or omission retains the default atomic result, and
a widened boolean retains the corresponding result union.

The public API does not expose separate atomic and non-atomic option interfaces.
Result inference reads the `atomic` literal directly through
`InferBulkOperationAtomicity` and `InferBulkOperationResult`. Runtime keeps its
closed normalized atomic contract separate from the public options object.

Internal execution names use operation vocabulary for normalized options,
private scopes, authority handlers, and dispatch. Query-specific names remain
only where the value or behavior genuinely belongs to Query composition.

## Consequences

- Reads, mutations, pointers, relations, and persisted models expose one
  consistent execution-options vocabulary.
- Bulk autocomplete presents authority and atomicity in the same object.
- `QueryBuilder` remains unrelated to execution ownership or authority.
- Trusted authority semantics, hook leases, transactions, and audit behavior do
  not change.
- `QueryTerminalOptions` and its bulk variants are removed as a deliberate
  development-time breaking API change.
