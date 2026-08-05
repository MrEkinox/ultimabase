# ADR-0141: Explicit read hooks and eager pointer inclusion

- Status: accepted
- Date: 2026-08-05
- Refines: ADR-0104, ADR-0116, ADR-0118, ADR-0137
- Refined by: ADR-0142

## Context

The schema hook names `beforeFind` and `afterFind` cover every read terminal,
including `first`, `get`, `count`, and `exists`. The name therefore exposes a
Parse-inspired implementation term instead of the actual operation family.

Pointer inclusion also needs a stable lifecycle while database adapters improve
their loading strategy. Treating every included pointer as a developer-visible
target Query makes hook execution depend on whether an adapter performs one
join, one grouped target query, or several singular queries. That leaks an
optimization into business behavior and makes hook cardinality unpredictable.

PostgreSQL can compile pointer inclusion through Drizzle relational queries.
Runtime must use that capability without weakening target Access, skipping
field output resolution, or changing which hooks run because of a loading
optimization.

## Decision

Schema read hooks are named `beforeRead` and `afterRead`. Cross-family
declarations such as `onError` use the `read` key. The read family remains
`find`, `first`, `get`, `count`, and `exists`, and the exact terminal stays
available through `kind`.

Schema and global read hooks belong only to the operation explicitly executed
through the request engine. Loading one pointer as part of a parent selection
does not manufacture a target `get`, `first`, or `find` lifecycle. Adapter
batching and eager loading therefore cannot change which schema hooks execute
or how often they execute.

`beforeRead` may refine root filtering, ordering, pagination, and limits, but it
must retain the exact schema, selection, and pointer-inclusion tree. This keeps
the executed eager-loading plan aligned with the result type established before
the Runtime pipeline begins.

An included target still crosses every data and security boundary that applies
to nested output:

- target operation, item, and field Access are evaluated with singular-read
  semantics;
- adapter and policy constraints narrow the eager target query;
- selected target fields are structurally validated;
- target field `resolveOutput` hooks run for present readable scalar values;
- nested inclusions recursively use the same contract; and
- target Access is applied before the hydrated value reaches parent result hooks.

`pointerField` does not support `resolveOutput`. Relationship identity comes
from persistence, field Access owns disclosure, and included-object values are
resolved through their target schema fields. `relationField` remains a
handle-only declaration and supports no field hooks.

Source pointer field Access continues to receive the schema-declared `Pointer`
value before and after hydration. Runtime retains that value in a private side
channel; parent result hooks receive only the hydrated target or `null`.

Eager targets are hydrated before the explicit parent schema's `afterRead`
phase. That hook receives the exact included result and may
replace an included object with another valid value, a pointer, or `null` when
the public result type permits it. Runtime does not perform a second inclusion
pass after a result hook. The hook replacement is authoritative, but recursive
structural validation remains framework-owned.

Core transports a versioned, database-neutral nested pointer-inclusion plan to
capable adapters. PostgreSQL compiles the plan with Drizzle relation metadata
and relational `with` queries. The logical hook lifecycle does not expose the
adapter's SQL shape.

## Consequences

- Hook names describe the complete read family rather than one terminal.
- Querying `Post` with an included `User` runs `Post` read hooks only.
- Included users retain target Access and field output behavior without hidden
  schema-hook side effects.
- PostgreSQL may resolve a nested pointer tree in one SQL statement.
- Parent result hooks observe hydrated included objects and own their final
  representation without triggering new database work.
- Adapters must explicitly advertise eager pointer inclusion before Runtime
  sends the nested plan.
