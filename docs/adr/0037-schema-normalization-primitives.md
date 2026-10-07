# ADR-0037: Shared guards and Schema normalization primitives

- Status: accepted
- Date: 2026-07-31

## Decision

Generic guards for plain records, unknown arrays, non-empty strings, and
optional booleans belong to `@ultimabase/shared`. They are deliberate public
primitives so foundational packages can validate untrusted JavaScript input
without duplicating unsafe narrowing logic or importing another package's
source tree.

Schema centralizes the zero-argument and exact-option call contract of scalar
field factories in one internal typed factory. Concrete fields continue to own
their validation and scalar snapshot behavior. Fields whose snapshot behavior
depends dynamically on options may retain specialized construction.

Numeric, length, temporal, and decimal constraints reuse one internal ordered
range normalizer. The shared helper owns container validation, boundary order,
copying, and freezing, while each field kind owns boundary semantics and value
comparison.

## Consequences

Adding a scalar field no longer requires copying the same overload and
construction implementation. Range behavior and untrusted primitive guards
have one source of truth, producing consistent errors and immutable snapshots.

The Shared public surface grows by four dependency-free guards. Schema retains
its exact public types and runtime metadata, and no third-party runtime
dependency is introduced.
