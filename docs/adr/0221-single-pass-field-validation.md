# ADR-0221: Field validation is a single mutation-input boundary

- Status: accepted
- Date: 2026-08-22
- Refines: ADR-0166, ADR-0219, ADR-0220
- Depends on: ADR-0039, ADR-0041, ADR-0166, ADR-0219, ADR-0220

## Context

ADR-0219 replaced UltimaBase's closed application-constraint language with a
synchronous Standard Schema validator on each stored value field. ADR-0220
moved the authoritative mutation pass after every optional input transformer,
but deliberately retained the earlier decision to execute the same validator
again at complete result boundaries.

That repetition gives one application rule two unrelated responsibilities:
deciding whether a proposed write is accepted and deciding whether existing
stored data may be read. It may execute an expensive developer callback several
times during one request, including on unchanged materialized preimages and
postimages. Tightening a rule can also make an older structurally valid row
unreadable even though the application has not proposed a mutation for it.

Application field validation is an input policy. It is not a storage decoder, a
database constraint, or an automatic data-migration mechanism. Core still
needs repeatable structural snapshots at every untrusted Runtime boundary, but
those snapshots do not need to replay developer application policy.

Atomic updates expose a second distinction. An `increment` or `decrement`
operand is a delta, not the resulting field value described by the field's
Standard Schema validator. A singular directed mutation whose target exists
already has a complete transaction-bound locked target before input resolution,
so Runtime can project the resulting value without weakening the adapter's
atomic write. A targetless upsert may still take its update branch after a
concurrent unique conflict, while a set-based `update-many` and an ordered
`upsert-many` do not necessarily expose all locked targets before execution.
Core cannot validate opaque final-value rules for those arithmetic branches
without either obtaining the targets or pretending that the delta is the final
value.

## Current execution inventory

`runtime/validation/runtime-validation.ts` currently carries one
`applicationValidation` execution flag. The initial mutation stage disables it,
while `createStructuralValidationExecution()` enables it for both final
mutation revalidation and result snapshots. The resulting application-validator
call sites are:

| Boundary                              | Production path                                                                 | Current application validation                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Initial mutation normalization        | `createRuntimeValidationStage()`                                                | Disabled                                                                                      |
| Final mutation input                  | `createFinalMutationValidationStage()` → `revalidateRuntimeMutationOperation()` | Enabled for complete values; arithmetic operands are structural only                          |
| Adapter result before hydration       | `snapshotDatabaseResultReplacement()` → `snapshotOperationResult()`             | Enabled                                                                                       |
| Adapter mutation materializations     | `snapshotMutationOutcome()` → `snapshotMaterialization()`                       | Enabled for create current values, delete previous values, and update previous/current values |
| Included pointer and relation records | `snapshotIncludedResult()` → `snapshotIncludedRecord()`                         | Enabled recursively                                                                           |
| Behavior database-result replacement  | `snapshotDatabaseResultReplacement()`                                           | Enabled                                                                                       |
| Behavior final-result replacement     | `snapshotResultReplacement()`                                                   | Enabled                                                                                       |
| Final selected result                 | `snapshotResultReplacement()` → `snapshotOperationResult()`                     | Enabled                                                                                       |

The same result-snapshot function is intentionally reused by several rows in
this inventory. The responsibility audit names the externally meaningful
boundaries so consolidating or moving that helper cannot accidentally preserve
application validation on one of them.

## Decision

### Standard Schema is mutation-input policy

A field's `validation` property executes only during Core's mandatory final
mutation-validation stage. It accepts or rejects complete canonical application
values proposed by the mutation after all configured input transformers.

The fixed mutation order remains:

```text
normalization
→ initial structural validation with defaults and generators
→ initial monotonic enforcement and target preparation
→ field and schema input resolution
→ target-aware prepared-operation transforms
→ mandatory final structural validation and one Standard Schema pass
→ value-dependent enforcement reevaluation
→ observers and persistence
```

The final pass runs even when no behavior plugin is installed and even when no
transformer changed the operation. Master authority bypasses authorization
policies only; it bypasses neither structural validation nor this application
validation boundary.

For every create input, update expression, and upsert branch, each complete
present non-null field occurrence crossing this boundary invokes its validator
once. Nested object and list occurrences follow their compiled field plans, so
the count is per complete validated occurrence rather than per top-level field
declaration. Missing and null handling remains Core-owned and does not invoke an
application validator.

The pass covers ordinary caller values, values produced by Core defaults and
generators, and values returned by field, schema, or prepared-operation input
transformers. It does not replay defaults or generators. Standard Schema output
remains rejection-only: Core retains its own canonical snapshot and rejects a
validator that attempts to transform it, as decided by ADR-0219.

An upsert contains explicit create and update input branches. Complete direct
values supplied in those branches are mutation input and are each checked once;
the adapter selecting one branch does not cause result-side replay. Arithmetic
validation additionally needs the existing target rules below.

### Structural snapshots remain repeatable

Core structural validation may execute wherever an untrusted value crosses a
Runtime boundary. It continues to enforce and snapshot:

- required presence, missing and canonical null handling;
- scalar runtime types and canonical representations;
- list and embedded-object shape, declared children, and unknown fields;
- enum domains, pointers, relations, and exact schema identity;
- immutable and generated operations, defaults, and generators at their
  existing mutation boundaries;
- integer safety, UUID syntax, temporal representations, binary values, and
  decimal precision and scale;
- plugin-field snapshots and storage codecs;
- query, selection, materialization, inclusion, and outcome envelope shape.

Reads, adapter output, mutation materializations, included records, behavior
result replacements, mutation outcomes, and final selected projections execute
only these structural snapshots. They never call a field's Standard Schema
validator.

A structurally valid stored row therefore remains readable after an application
tightens or replaces its validator. A malformed stored value still fails its
Core snapshot or codec. This decision does not convert result handling into an
untyped adapter escape hatch.

### Arithmetic validates the projected complete value

Core structurally validates every `increment` and `decrement` operand as a
delta. It never passes that delta to the field validator as though it were the
complete value.

For `update-one` and the update branch of `upsert-one` when a target exists,
Runtime uses the complete target already returned by the transaction-bound
prepared operation. After all input transformers, it applies the final
normalized update expression in memory with the same integer, bigint, float,
and exact-decimal semantics as `applyUpdateExpressionToRecord()`. It then runs
the field's Standard Schema validator once on each projected complete
arithmetic result.

Projection is validation evidence only. Runtime retains the original logical
`increment` or `decrement`, the persistence plan retains an atomic delta, and
the adapter executes that delta against the already locked target. Projection
does not add another target read and does not replace the operation with `set`.
Core structural validation rejects unsafe integer results and decimal results
outside the declared precision and scale before application validation or
persistence. A declared application validator may further reject a float result
such as infinity.

An absent `update-one` target produces no arithmetic result and therefore does
not invoke a validator for that delta; complete direct update values remain
ordinary mutation input. For `upsert-one`, an existing target permits
projection of update arithmetic. When its initially locked target is absent,
Core still validates the complete create and direct update values, but it
rejects an arithmetic update over a validated field before persistence. The
adapter may otherwise take that update branch after a concurrent unique
conflict, when no pre-write projection was available.

Set-based mutations have a stricter precondition:

- `update-many` may apply arithmetic to a field with application validation
  only when the prepared operation exposes every complete locked target in the
  affected set;
- an `upsert-many` arithmetic update branch requires an exact prepared target
  for each item whose update branch may execute; and
- when those targets are unavailable, Core rejects the operation before
  persistence instead of loading rows implicitly, validating the delta,
  skipping validation, or depending on post-write materializations.

This precondition keeps the existing set-based fast path for operations whose
complete values can be validated directly. It does not add a public bulk-read
toggle or make optional plugin installation silently weaken validation. A
future public way to request item preparation would require its own proven use
case and decision; this ADR does not invent one.

### Storage integrity remains layered

Standard Schema is not promoted to a database invariant. Persistent integrity
continues to use the appropriate layer:

- Core structural plans and immutable snapshots protect Runtime values;
- field and plugin codecs protect logical-to-storage conversion;
- protected constraints narrow adapter execution;
- adapter constraints and database constraints protect supported physical
  invariants; and
- migrations deliberately reconcile stored data when an application contract
  changes.

Database triggers or external writers can still produce a value that is
structurally valid but rejected by a newer application validator. Result-side
structural validation accepts that row. Applications requiring a durable
invariant must express it through database schema or migration facilities, not
rely on read-time Standard Schema replay.

### No parallel validation modes

Core exposes no `validateOnRead`, compatibility switch, execution-count option,
second validator property, or validation plugin. The internal application-
validation switch is narrowed or removed once result snapshots become
structural-only. Typegen continues to omit the opaque validator and the public
field option remains `validation` exactly as accepted by ADR-0219.

The mandatory final stage now receives the prepared singular target and any
explicitly prepared bulk targets. This incompatibly changes
`RuntimePipelineStages`, so `ultimabase.runtime-executor` advances from `2.0.0`
to `3.0.0`. The behavior protocol remains `2.0.0`: behaviors already receive
their prepared inputs and gain no new responsibility for validation.

## Consequences

- Developer validators have one predictable cost and one meaning: accept or
  reject final proposed mutation values.
- Explicit input normalization remains possible before strict application
  validation.
- Changing an application rule does not retroactively block structurally valid
  reads.
- Result boundaries remain defensive because Core snapshots their structure,
  canonical scalar values, relationships, and plugin-defined fields.
- Singular arithmetic cannot evade application validation and keeps database
  atomicity.
- Low-level bulk arithmetic over validated fields must provide complete stable
  targets or fail before persistence. This limitation is preferable to an
  approximate or plugin-dependent security boundary.
- Existing result-side tests that used Standard Schema as a malformed-adapter
  detector must move that expectation to structural invalidity tests.

## Rejected alternatives

### Continue validating every complete result

This preserves duplicate callback execution, couples reads to the current
write policy, and makes validator changes behave like implicit migrations.

### Validate the arithmetic delta

A delta may satisfy a range that the resulting value violates. It is not the
field value described by the validator.

### Replace atomic arithmetic with a projected set

This changes logical and physical semantics, weakens adapter atomicity, and
duplicates persistence responsibility in Runtime.

### Always load every bulk target

This silently changes the set-based fast path into an item-loading path and can
substantially increase lock duration, memory use, and contention. Target
materialization must remain explicit rather than being hidden inside field
validation.

### Skip bulk arithmetic validation

This creates an operation-shaped bypass of the same declared field contract.
Core rejects the unsupported execution instead.

### Offer optional read validation

Two modes make stored-row readability environment-dependent and retain the
ambiguous dual role this decision removes.

## Required implementation and verification

Issue 2102 implements the decision and must cover:

- invocation counters for create, update, upsert, defaults, generators,
  transformed input, lists, objects, pointers, and plugin-defined fields;
- zero application-validator calls across reads, adapter results,
  materializations, includes, outcome transforms, and final projections;
- exact integer, bigint, float, and decimal projection from locked singular
  targets while preserving the adapter delta;
- deterministic rejection of targetless upsert arithmetic over validated
  fields, including the concurrent-conflict branch;
- rejection of bulk arithmetic over validated fields when complete prepared
  targets are unavailable, plus exact per-target validation when they are
  available;
- ordering before value-dependent enforcement, observers, and persistence;
- unchanged Master, Standard Schema failure mapping, synchronous execution,
  opaque identity, and canonical typing behavior; and
- Runtime capability declarations and public package types if carrying prepared
  targets changes the final-stage contract.

Issue 2103 must audit the single remaining production application-validator
path and run Runtime, type, Typegen, packed-package, JavaScript, public E2E, and
PostgreSQL Testcontainers coverage. PostgreSQL tests must prove rejected
projected arithmetic never executes its adapter write, accepted arithmetic
remains atomic, stored rows failing a tightened application rule remain
readable, and structurally malformed adapter values still fail.

## Non-goals

- Asynchronous or database-backed Standard Schema validation.
- Automatic migration or repair of existing stored rows.
- Replacing database constraints with application callbacks.
- Generalizing arithmetic updates to non-numeric or plugin-defined field kinds.
- Introducing a new public bulk-target preparation API.
