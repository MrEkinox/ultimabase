# ADR-0181: Every model projection exposes its identifier

- Status: accepted
- Date: 2026-08-10
- Refines: ADR-0109, ADR-0115, ADR-0151, ADR-0180

## Context

UltimaBase previously allowed a result selection to omit `id`. Runtime and the
PostgreSQL adapter then retained a second protected identity so immutable model
commands could still target the persisted object. This made a model-shaped
result depend on hidden state and forced developers to request `id` repeatedly
for ordinary equality, caching, normalization, and relationship work.

Generated mutation and nested inclusion projections make the inconsistency more
visible: a developer can receive a concrete model class while its stable model
identity is absent from both its TypeScript shape and serialized value.

## Decision

Every model returned by a read, mutation, instance command, pointer inclusion,
or relation inclusion exposes its `id`. The rule applies recursively to every
materialized model in an inclusion tree.

An explicit non-empty `select` implicitly adds `id` to the canonical Query AST.
An empty or absent selection still means the complete result and therefore also
contains `id`. Generated selection contracts expose `id?: true`; `id: false` is
both a TypeScript error and a runtime error for untyped callers. Other fields
retain the existing inclusive and exclusive boolean selection behavior.

Core result inference and immutable model command inference include `id` even
when the caller does not spell it in `select`. Database adapters receive the
canonical selection containing `id` and must return it like every other public
selected field. Adapter-proven protected identity metadata remains a defensive
correlation mechanism for mutation targeting and hook result replacement, but
it no longer hides a public identifier.

## Consequences

- Every model has one visible stable identity suitable for equality, caches,
  normalized clients, and subsequent commands.
- Root and nested projections share one rule; no relationship-specific identity
  exception exists.
- Selecting one scalar reads one additional identifier column, without adding a
  database round trip.
- Existing code that explicitly selects `id: true` remains valid but redundant.
- Code that used `id: false` must remove that flag.
