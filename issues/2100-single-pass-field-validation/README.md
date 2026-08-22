# Milestone 21 — Single-pass field validation

- Status: in-progress

Run each field's Standard Schema application validator exactly once for every
final mutation candidate, after all optional input resolution. The validator
does not run while reading persisted values, snapshotting adapter output,
materializing mutation results, resolving includes, or projecting final output.

Core continues to enforce canonical scalar types, missing and null handling,
list and object shape, relationship identity, defaults, generators, immutable
and generated operations, decimal shape, codecs, and result snapshots at their
existing boundaries. Those structural guarantees remain repeatable. Only the
optional application validator becomes mutation-input-only.

For `increment` and `decrement`, the delta is not the complete field value and
must never be passed to the application validator as though it were. Runtime
projects the resulting value from the target already loaded and locked before
input resolution, validates that projection once, and still sends the original
atomic operation to the adapter.

Low-level bulk arithmetic over a validated field requires complete prepared
targets. When they are unavailable, Core rejects the operation before
persistence instead of forcing implicit item loading onto the set-based path or
skipping final-value validation.

A targetless upsert follows the same rule for a validated arithmetic update
branch: Core rejects it because a concurrent unique conflict could still select
that branch without a projected complete value.

## Execution order

1. [x] [2101 — Decide the single-pass mutation-validation boundary](2101-single-pass-field-validation-adr.md)
2. [x] [2102 — Execute Standard Schema only on final mutation input](2102-mutation-only-standard-schema-execution.md)
3. [ ] [2103 — Verify exact field-validator invocation](2103-single-pass-field-validation-verification.md)

## Deliberate boundaries

- A create, update, or upsert candidate runs Standard Schema once per complete
  present non-null validated field occurrence after input resolution.
- The pass still validates ordinary caller values, Core defaults, generated
  values, and final values returned by mutation input transformers.
- Arithmetic updates validate the complete projected result against the locked
  target. The logical operation and physical atomic write remain unchanged.
- Bulk arithmetic never receives an approximate exception: exact prepared
  targets are required or the operation fails before persistence.
- Reads and persistence results run Core structural snapshots without executing
  Standard Schema. Tightening a validator therefore does not make existing rows
  unreadable.
- Validation remains synchronous, deterministic, rejection-only, and
  non-bypassable by Master for mutation input.
- No `validateOnRead`, execution-count option, compatibility mode, validation
  plugin, or second validator property is introduced.

## Completion gate

The final issue records exact invocation counts for native, list, object,
pointer, and plugin-defined fields; proves zero calls on every read and result
boundary; proves atomic updates cannot escape final-value validation; and runs
source, packed-package, public E2E, and PostgreSQL Testcontainers verification.
