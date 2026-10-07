# ADR-0180: Transaction-bound mutation relationship projections

- Status: accepted
- Date: 2026-08-10
- Refines: ADR-0109, ADR-0132, ADR-0164, ADR-0172, ADR-0177

## Context

Schema reads accept one exact `select` plus a recursively typed `include`, while
create and update commands currently accept only the flat selection. Developers
must issue a second public read to receive a persisted object with eagerly loaded
relationships. That second terminal repeats root read Access and creates another
observable lifecycle even though the mutation already owns an automatic
transaction and a complete persisted identity.

Adding `include` only to the public types would be incorrect. Database mutation
returning clauses expose scalar columns but cannot portably return the same
nested pointer and relation graph as a read. The result projection therefore
needs a transaction-bound read without presenting itself as another public root
operation.

Collection commands add a second concern. ADR-0164 defines them as ordered
batches of singular item lifecycles. Reading every result separately would add
one root projection query per item, while projecting only after the batch can no
longer distinguish two updates directed at the same persisted object.

## Decision

`createOne`, `createMany`, `updateOne`, and `updateMany` accept the generated
schema `include` contract beside `select`. Delete and upsert commands retain
their current contracts until a later decision.

The projection is caller-facing only. Schema mutation hooks continue receiving
their complete selection-independent `item` and `originalItem`; they do not
receive included targets or another result value.

### Singular commands

When a singular create or update requests at least one include, Runtime:

1. executes the normal item-oriented mutation lifecycle;
2. retains the adapter-proven persisted object identifier;
3. performs one internal result projection by that identifier inside the same
   automatic transaction;
4. applies the already compiled nested target read Access, field restrictions,
   scalar output processing, and inclusion hydration;
5. returns the exact generated projection.

The internal projection is not a public schema read. It does not replay source
operation Access, source schema hooks, mutation Access, or input resolution.
Included target schemas keep the established inclusion behavior: target read
Access and field output processing apply, while target schema read hooks do not
run.

The original mutation predicate is never reused for result loading because an
update may change a field participating in that predicate.

### Collection commands

One `select` and one `include` apply to every collection result. Runtime executes
all item-oriented mutation lifecycles in declaration order, collects their
adapter-proven persisted identifiers, then performs one grouped internal result
projection before commit. The grouped read may return database rows in any
order; Runtime validates every identity and restores declaration order.

Each persisted object may be targeted only once within one collection command.
A repeated adapter-proven identity is a validation failure and rolls back the
complete batch. This keeps one input position correlated with one unambiguous
final persisted result and makes grouped projection sound even when different
unique predicates identify the same object.

The grouped projection represents transaction-final persisted state after all
item lifecycles have completed. It replaces the selected public result for the
batch; hook inputs remain the per-item values observed during their own
lifecycles.

Empty batches execute no projection. A command without `include` retains its
existing write and returning path and performs no follow-up result query.

### Adapter boundary

Core builds the internal projection from the portable Query and inclusion AST.
It uses the active transaction adapter's existing read and eager-inclusion
capabilities rather than adding mutation-specific relation SQL or a new public
read terminal. PostgreSQL therefore reuses Drizzle's relational query builder.

## Consequences

- Mutation result shaping becomes homogeneous with reads and remains exactly
  typed by generated schema contracts.
- Singular includes add one result read; collection includes add one grouped
  result read rather than one read per item.
- Access and hooks retain their accepted item cardinality and execute no extra
  root lifecycle for result projection.
- Collection results preserve input order even when the adapter does not.
- Repeating one target inside `updateMany` becomes an explicit error instead of
  producing ambiguous intermediate and final projections.
- Mutation adapters need no custom relationship-returning implementation when
  they already support portable eager reads inside a transaction.
- Delete projection timing, upsert branching, nested writes, and transport
  mutation syntax remain separate decisions.
