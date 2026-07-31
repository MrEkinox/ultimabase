# ADR-0033: Field factory provenance and snapshot capabilities

- Status: accepted
- Date: 2026-07-31
- Validation-plan snapshot behavior superseded by: ADR-0039
- Runtime capability access refined by: ADR-0041

## Decision

Every built-in, system, object, and plugin field is created through one private
capability-aware factory. Schema records field identity in a `WeakMap` together
with the scalar `snapshotValue` capability used for static defaults. Schema and
object composition accept only definitions carrying this provenance; structural
lookalikes are rejected even when their `kind` and `options` appear valid.

Community fields continue to use `definePluginField`. Its callback is named
`snapshotValue` to describe the boundary precisely. The callback must be pure,
deterministic, and idempotent. It must detach mutable values and may be reapplied
when validation plans snapshot a static default.

Framework-owned field kinds and plugin-reserved kinds have one shared source.
Plugin kinds remain non-empty namespaced identifiers and cannot shadow a
framework kind. `assertFieldOptions` is public so community factories can guard
unknown options before reading plugin-specific metadata.

This decision replaces ADR-0030's structural field-tree checks and its
`normalizeValue` callback name. The remaining declaration-boundary decisions in
ADR-0030 still apply.

## Consequences

Malformed required, nullable, list, and field-specific metadata cannot be
smuggled into a schema through a hand-written field object. Object defaults no
longer need a switch over every built-in kind because each field owns its exact
snapshot behavior. Weak ownership does not retain application schemas or expose
capabilities in serializable metadata.
