# ADR-0200: Persistence rewrites are physical and constraints remain Core-owned

- Status: accepted
- Date: 2026-08-19
- Refines: ADR-0063, ADR-0099, ADR-0100, ADR-0102, ADR-0188, ADR-0191, ADR-0199
- Depends on: ADR-0188, ADR-0191, ADR-0199

## Context

ADR-0188 separates logical operations from physical persistence plans but does
not fix the first portable plan protocol, the adapter negotiation boundary, or
where protected row restrictions live while a plugin rewrites a plan. Passing
constraints to a rewriter would let trusted business middleware inspect policy
state and would make it easier to omit restrictions from the replacement
statement. Treating a physical update as a new Runtime operation would instead
replay update validation, Access, hooks, audit, and transaction semantics.

The first implementation needs one proven use case: a plugin may retain logical
delete semantics while PostgreSQL writes a tombstone update. Broader custom
operation, storage-codec, and adapter bridges belong to issues 1416 and 1417.

## Decision

### Versioned immutable plan protocol

Core compiles each normalized built-in operation into persistence-plan protocol
version 1. A plan contains one exact physical statement kind, schema target,
statement data, logical returning contract, protocol version, and immutable
owner provenance. The logical operation remains the authority for validation,
hooks, Access, diagnostics, public result correlation, and transaction policy.

Protocol version 1 permits only an identity rewrite or these proven mappings:

```text
logical delete-one  → physical update-one
logical delete-many → physical update-many
```

`rewriteDeletePersistencePlan()` preserves the target query and returning
contract while replacing only the physical update expression. Core validates
every returned object and appends contribution ownership itself. A rewriter
cannot self-assert provenance, change schemas, change result shape, mutate the
logical query, introduce another statement family, or start a nested operation.

### Protected execution envelope

Protected row filters, relation scopes, and opaque database constraints are not
members of the plugin-visible persistence plan. They remain in a separate
Core-owned adapter request envelope and are attached to the final rewritten
statement. This is the persistence plan's constraint contract: every adapter
must combine the envelope monotonically with the physical target, while a
rewriter receives no policy state it could clear or broaden.

The `persistencePlanRewriterCapability` is application-local, ordered by the
plugin graph, and absent when no provider exists. Providers must use
`providePersistencePlanRewriter()` and declare `persistence:rewrite`. Generic
providers, requirements, decoration, and replacement are rejected. Rewriting
does not grant `runtime:replace`, master authority, or adapter access.

### Adapter negotiation and PostgreSQL execution

Adapters advertise the exact version and statement kinds they support through
`databasePersistencePlanCapability`. Runtime rejects absent, incompatible, or
kind-incomplete support before invoking the adapter.

PostgreSQL uses the canonical plan while locking the visible mutation target,
then consumes the final rewritten plan on the retained target inside the same
transaction. A delete-to-update rewrite emits one parameterized `UPDATE` with
all final constraints but returns the retained delete preimage and delete
materialization. Ordered generated collection deletes retain singular logical
operations, so each plan is rewritten in order and one failure rolls back the
complete batch.

## Consequences

- Hooks, Access, audit, results, relations, and master behavior never observe a
  synthetic update operation for soft delete.
- Protected constraints cannot be removed by a persistence rewriter and apply
  to the actual physical statement.
- Adapter incompatibility and malformed rewrites fail with protocol or owner
  diagnostics instead of drifting into SQL behavior.
- JavaScript applications execute the same application-local plan graph without
  Typegen or generated runtime files.
- Later plan families require an explicit protocol refinement rather than an
  open-ended operation or SQL escape hatch.

## Non-goals

- A production soft-delete plugin or automatic tombstone schema changes.
- Destructive migrations, partial-index policy, or uniqueness semantics.
- Custom operation, value-codec, raw lease, or physical schema bridges from
  issues 1416 and 1417.
- Exposing protected constraints to rewriters or moving master authority out of
  Core.
