# ADR-0115: Immutable model commands and protected identity

- Status: accepted
- Date: 2026-08-03
- Refines: ADR-0067, ADR-0100, ADR-0108, ADR-0109, ADR-0114
- Refined by: ADR-0192

## Context

Constructible schema models distinguish caller-created drafts from
Runtime-materialized persisted results. Developers should be able to persist
either state without repeating a Query identifier filter, but selected and
field-restricted results must not reveal `id` merely to support that
convenience. A constructor input or TypeScript cast must also be unable to forge
trusted persisted state.

## Decision

### State-specific immutable commands

A draft exposes `create(options?)` and
`upsert({ where, update }, options?)`. Its frozen create values become the
Query create branch. Upsert converts the non-empty, non-null `where` record into
equality filters and reuses Query's exact unique-index validation.

A Runtime-materialized result exposes `update(input, options?)` and
`delete(options?)`. Both target a protected Runtime-issued object identifier,
delegate to the corresponding singular Query terminal, and preserve the
instance's effective public projection. Every successful command returns a new
immutable instance; a concurrent missing target returns `null` for update or
delete exactly like Query.

The shared terminal options remain the final argument. Commands therefore
inherit the ambient request and hook transaction or select the exact explicit
application, plugin context, and audited master authority from ADR-0114.

There is no mutable setter, dirty tracking, implicit write batch, automatic
create-or-update `save()`, or collection command on an instance.

### Protected lifecycle and identity

Core retains draft versus persisted provenance in private weak records. Only
Runtime owns the construction key for persisted instances. A visible `id`, a
constructor cast, borrowed prototype method, or structurally similar object
cannot change that state.

Database adapters may expose `readObjectIdentity(record)` when an exact public
projection omits `id`. Runtime reads that side channel before result hooks and
associates each stable result slot with its protected identity. PostgreSQL
always includes `id` in its physical object projection, immediately removes it
from the logical public record when it was not requested, and retains the value
in an adapter-private `WeakMap`.

Runtime materialization validates the protected identifier through the schema's
declared `id` field. When `id` is also visible, both values must match. The
identity and effective selection never enter enumerable model values, Query or
Operation ASTs, hook payloads, diagnostics, or serialization.

## Consequences

- Draft and persisted autocomplete expose only valid lifecycle commands.
- Selected and field-restricted models can target themselves without widening
  their returned shape, even when a later command uses stronger authority.
- Hooks, policies, validation, transactions, cancellation, and adapter behavior
  remain identical to the delegated Query terminal.
- Custom adapters that omit `id` from selected logical records must provide the
  protected identity reader to support instance update and delete; otherwise
  those commands fail closed with a missing protected identity error.
- Result-transform hooks retain the framework's stable collection-slot ordering
  for protected identity correlation.
