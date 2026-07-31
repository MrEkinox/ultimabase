# ADR-0070: Plugin hooks and post-commit events

- Status: accepted
- Date: 2026-08-01
- Refines: ADR-0015, ADR-0047, ADR-0048, ADR-0064, ADR-0068

## Context

The Runtime pipeline already reserves deterministic positions for global and
schema before/after hooks plus post-commit effects. Plugins need a typed way to
declare those behaviors without teaching Core about Runtime operation types or
allowing mutable pipeline inputs. Explicit transactions must also prevent an
external observer from seeing work that can still roll back.

## Decision

Runtime exposes `beforeOperation`, `afterOperation`, and `postCommitEvent`
factories. Each creates an immutable opaque definition with an optional schema
filter and optional non-empty operation-kind filter. Omitting the schema makes a
hook global.

Plugins register before/after definitions in the Core `hooks` registry and
post-commit definitions in `events`. Core exposes read-only contribution
snapshots only after application setup. Snapshot insertion order is the plugin
graph order from ADR-0047, so dependencies run first and configuration position
breaks ties. Core does not import or validate Runtime-specific definitions.

Runtime validates the definition provenance, category, and schema ownership,
then `createRuntimeHookStages(application)` composes the five reserved pipeline
stages. Global before-hooks run before schema before-hooks. Schema after-hooks
run before global after-hooks. Contributions within each position keep their
plugin order.

Hook inputs are fresh immutable envelopes. A before-hook returns exactly
`{ operation }` and must preserve the operation kind and exact schema identity.
An after-hook returns exactly `{ result }`. These explicit wrappers distinguish
intentional replacement from accidental mutation and allow transformations to
flow sequentially through later hooks.

After-hooks execute inside the business transaction and may abort it. A
post-commit event runs after a successful standalone commit. An explicit
transaction buffers those effects until its outer commit and discards them on
rollback.

## Consequences

- Hook ordering requires no second priority system and follows plugin ordering.
- Schema-specific handlers retain their operation and result inference.
- Runtime can reject definitions registered in the wrong Core category.
- External delivery cannot observe uncommitted data through this event stage.
- A future normalized realtime event payload can build on this boundary without
  changing the transaction guarantee.
