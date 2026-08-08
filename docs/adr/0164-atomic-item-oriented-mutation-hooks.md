# ADR-0164: Atomic item-oriented mutation hooks

- Status: accepted
- Date: 2026-08-08
- Refines: ADR-0069, ADR-0089, ADR-0099, ADR-0100, ADR-0101, ADR-0132, ADR-0143, ADR-0147, ADR-0148, ADR-0153, ADR-0161, ADR-0163
- Refined by: ADR-0166
- Supersedes: ADR-0111

## Context

Grouped mutation hooks initially exposed different operation shapes for
singular and collection terminals. A developer implementing one object-level
business rule therefore had to handle both `update-one` and `update-many`, even
though the rule and its desired result were identical for every affected item.

Set-based update and delete also prevented `resolveInput`, item Access, and
business hooks from sharing one coherent lifecycle. A schema input resolver for
an update needs the existing visible object, while Access must approve and hide
that object before developer code can observe it.

Optional non-atomic collection writes added a second incompatible lifecycle:
hook-started transactional work for a later failed item could not safely coexist
with a committed successful prefix.

## Decision

Public collection mutation commands are ordered batches of singular operations:

- `createMany({ data })` itemizes every create input;
- `updateMany({ data })` accepts `{ where, data }` entries;
- `upsertMany({ data })` accepts `{ where, create, update }` entries;
- `deleteMany({ where })` accepts an array of unique target predicates.

Each update, upsert, or delete predicate must identify one unique target. The
batch preserves declaration order, runs inside one automatic transaction, and
returns one result per input. A missing directed target raises `NOT_FOUND` and
rolls back the complete batch. Empty batches resolve to an empty immutable
array without opening a transaction or item lifecycle. Set-oriented `updateWhere` and
`deleteWhere` commands are deliberately not introduced by this decision.

The public `atomic` option and partial-success result are removed. Every
collection mutation either commits all of its item operations or rejects.

Native schema and field hooks do not expose collection cardinality. The
`beforeOperation.create` callback receives `kind: "create"`, `context`, and the
complete candidate `item`, without a constant `originalItem` or internal AST.
The candidate uses a distinct internal `prepared-draft` state: it is an
immutable generated schema instance with complete normalized values, but its
public type exposes no persistence command. Other mutation callbacks retain
their focused item-oriented contract. The collection terminal is an API
convenience and does not create a second hook lifecycle.
`beforeOperation` exposes create, update, and delete; `afterOperation`
additionally exposes upsert. Every callback runs once per item with the same
complete, selection-independent pair used by the corresponding singular
command.

Every item-oriented mutation boundary uses the same cardinality-free public
`kind`: schema item Access, mutation field Access, field and schema
`resolveInput`, before- and after-operation hooks, and transaction changes.
When a callback also exposes the normalized AST, `operation.kind` keeps its
exact internal singular terminal such as `delete-one`. Early operation Access
also keeps exact terminal kinds because it runs before itemization.

Schema input resolution follows the target-aware pipeline:

```text
normalization and initial structural validation
→ field resolveInput
→ operation and field Access
→ load and lock the visible target when one may exist
→ item Access
→ schema resolveInput with originalItem
→ structural revalidation of the transformed operation
→ value-dependent Access re-evaluation
→ beforeOperation
→ database write
→ afterOperation
```

For create, `originalItem` is `null` and schema resolution runs before adapter
preparation because no target exists. For update, it is the complete locked
visible object. For upsert, it is the locked object or `null` when no object was
visible during preparation. Delete has no input resolver.

Every non-null `originalItem` is materialized as a complete persisted schema
instance before it crosses the developer hook boundary. Its protected identity
and regular instance commands remain valid and delegate nested work through the
same Runtime transaction pipeline.

The operation target is frozen across schema resolution: a resolver may replace
values but cannot change the schema, terminal, query, or prepared object. Runtime
revalidates transformed values without replaying defaults or generators, then
rechecks value-dependent field and item Access before persistence.

PostgreSQL prepares each singular update, delete, or upsert with Drizzle on the
same borrowed transaction client. An upsert prepared with `originalItem: null`
can still encounter a concurrent unique-key winner during execution; its
after-operation materialization reports the actual persisted create or update
branch and is the authoritative final pair.

Transaction hooks remain transaction-wide. Their ordered `changes` collection
contains the singular operations completed by both singular and collection
commands.

## Consequences

- Hook and Access code use one item-oriented mutation model with no cardinality
  branch.
- `resolveInput` can safely inspect the existing visible item without exposing a
  target denied by operation, field, or item Access.
- Collection writes may execute several prepared database statements, but they
  share one transaction and preserve deterministic input/result association.
- A later missing target or hook failure rolls back every earlier item write and
  hook-started database operation in the batch.
- Low-level database adapters may retain set-based AST support for internal
  capabilities, but generated schema collection commands and native item hooks
  do not expose that path.
- The removed non-atomic and set-based public shapes are intentional
  development-time breaking changes with no compatibility aliases.
