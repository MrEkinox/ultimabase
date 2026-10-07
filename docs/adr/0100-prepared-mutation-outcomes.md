# ADR-0100: Prepared mutation outcomes

- Status: accepted
- Date: 2026-08-02
- Refines: ADR-0063, ADR-0067, ADR-0069, ADR-0085, ADR-0089, ADR-0098, ADR-0099
- Refined by: ADR-0101, ADR-0111, ADR-0112

## Context

The portable database adapter currently accepts one normalized operation and
returns only its exact public result. That is sufficient for CRUD, but native
field hooks need information that a selected public result deliberately omits.
For example, a singular delete needs a stable preimage before affected-field
hooks run, and `onChange` needs complete previous and current values rather than
the caller's projection.

Reading that information through an unrelated query would create a race between
the hook and the write. Returning every internal field as the public result
would instead break selection inference and the field-restriction boundary.
Automatic mutation transactions already guarantee that Runtime can keep a
prepared target, its hooks, and its write on one adapter lifetime.

Upsert adds a separate constraint. Its create and update inputs are known before
execution, but a concurrent writer can change which branch wins. A portable
hook contract must not claim that a speculative pre-read has resolved the
database's eventual atomic branch.

## Decision

### Required transaction-adapter protocol

Every `DatabaseTransactionAdapter` implements a portable prepared-mutation
protocol. Root `DatabaseAdapter` instances continue to execute reads and create
transactions; mutations already enter a transaction before reaching this
boundary under ADR-0099.

Preparation validates one exact normalized mutation request and returns an
opaque immutable handle owned by the transaction adapter that created it. The
handle is single-use and cannot be executed through another adapter, after
transaction finalization, or with a substituted terminal or schema.

Runtime completes every operation-transforming schema and plugin hook before
preparation. Preparation then establishes the stable database state needed by
affected-field hooks. Those field before-hooks are effect handlers rather than
operation transforms, so they cannot invalidate the prepared target. Execution
consumes the handle exactly once.

The mutation lifecycle therefore refines the database portion of ADR-0089:

```text
plugin and schema operation transforms
→ prepare and stabilize the mutation target
→ affected-field before hooks
→ execute the prepared mutation
→ affected-field after and onChange hooks
```

Policy-neutral guards, constraints, and field restrictions still run before
effectful business hooks as required by ADR-0090. Preparation receives the
already accumulated adapter constraints and cannot remove or reinterpret them.

### Internal outcome and public result

Executing a prepared mutation returns one immutable internal outcome with two
separate views:

- the exact public result promised by the terminal, including its selection,
  nullability, order, or numeric summary;
- materialized item outcomes used only inside Runtime, with an explicit branch
  and complete logical previous and current states.

Logical absence uses an explicit state rather than `undefined`. A created item
has no previous object and one complete current object. An updated item has
complete previous and current objects. A deleted item has one complete previous
object and no current object. A singular update or delete with no matching row
contains no materialized item, returns `null`, and does not run affected-field
hooks.

For singular update and delete, the prepared `target` is the stable snapshot
observed by before-hooks. If those hooks deliberately change that row through
the same transaction, the execution materialization instead records the exact
state that was updated or removed, so after-hooks observe what persistence
actually consumed.

Internal materialization is independent from `.select()`. Runtime may therefore
run field hooks with the values they require while returning only the fields the
developer selected. Internal snapshots remain inside the enforcement boundary
and never become transport output merely because an adapter loaded them.

True set-based `update-many` and `delete-many` remain the deliberate exception.
They produce an affected-row count and never create per-row snapshots merely to
simulate item hooks.

### Upsert branch timing

`beforeUpsert` receives the immutable create candidate and update candidate. It
does not receive a speculative `create` or `update` branch. The actual branch is
recorded only by the consumed prepared mutation outcome, after the database has
resolved concurrency, and is then available to after, change, and transaction
finalization hooks.

This distinction preserves atomic upsert behavior across database adapters and
prevents a pre-read from promising a branch that a concurrent unique-key write
can change. Ordered upsert-many outcomes retain input order regardless of the
physical statement strategy selected by the adapter.

Schema hooks receive both candidates through the normalized operation. Field
hooks keep their exact value typing by running once for each present candidate,
in create-then-update order; their `mode` identifies the candidate, not a branch
already selected by the database.

### PostgreSQL delivery

Issue 344 introduces the protocol and implements the singular PostgreSQL path.
`create-one` retains its complete Runtime-normalized candidate and returns its
complete persisted current state. `update-one` and `delete-one` stabilize their
deterministic target on the transaction's borrowed client, retain the complete
logical preimage, and execute against that same target. Full internal returning
data is decoded through the existing schema codecs before Runtime sees it.

Issue 508 implements PostgreSQL create-many, set-based update-many and
delete-many, and unique-target upserts through this protocol. It owns the exact
concurrent upsert statement strategy and must expose only the branch that the
database actually executed.

## Consequences

- Native field hooks no longer depend on the caller selecting their fields.
- Singular update and delete may require target stabilization before their
  write, but remain atomic inside one transaction.
- Database plugins implement one explicit mutation lifecycle instead of
  leaking private query builders or raw database records into Runtime.
- Public terminal result types remain unchanged.
- Upsert before-hooks are candidate-aware and branch-neutral; branch-specific
  effects belong after execution.
- Bulk and upsert PostgreSQL work remains isolated in issue 508 without blocking
  the singular dispatcher foundation.
