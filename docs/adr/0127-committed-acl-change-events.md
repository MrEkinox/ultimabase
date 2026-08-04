# ADR-0127: Committed ACL change events

- Status: accepted
- Date: 2026-08-04
- Refines: ADR-0089, ADR-0105, ADR-0107, ADR-0122, ADR-0123, ADR-0126

## Context

ACL changes need one audit-ready signal that covers generated defaults, explicit
master input, ordinary replacement, and subject-reference cleanup. Exposing a
second ACL-specific hook API would duplicate native field hooks and let callers
confuse observation with authorization. Emitting before commit would instead
publish state that may still roll back.

ACL is also an opaque immutable class whose state lives outside enumerable
properties. Generic JavaScript structural equality therefore cannot distinguish
two ACL instances. Native field change detection needs the field owner's
portable representation to decide whether an opaque plugin value changed.

## Decision

### Native field lifecycle is the only hook lifecycle

`aclPlugin()` contributes one internal field-kind `onChange` observer for its
reserved ACL field. It runs after native Access has authorized the mutation and
does not grant, deny, rewrite, or bypass any operation. There is no public
`acl({ hooks })` or ACL-specific before/after callback family.

Native materialized field changes expose the persisted object's stable
`itemId`. Both `onChange` and `afterCommit` receive this generic identity, so a
field plugin can identify its row without receiving the complete private
materialization.

For plugin-defined fields with a portable storage codec, Runtime compares the
encoded logical values when deriving semantic field changes. Built-in fields
continue to use deep structural equality. Equivalent opaque values therefore
do not produce duplicate changes, while different values cannot disappear
because their public class shells look alike.

### One typed transaction-bound event

Every semantic ACL create or replacement queues
`ultimabase.acl.changed` through `HookContext.emit`. The immutable JSON payload
contains:

- the anonymous or master authority and optional current principal;
- the target schema class name and object ID;
- the mutation terminal;
- canonical added and removed rights grouped by public, authenticated,
  principal, or role subject.

The payload never exposes ACL private collections. Master changes are included
even though master bypasses ACL authorization. Deleting an object does not emit
an ACL-change event because the ACL is not independently rewritten; ordinary
object-deletion observation owns that lifecycle.

Core delivers the event only after the outer transaction commits. Rollback
discards it, including when several cleanup updates were already queued.
Create-many and upsert-many retain deterministic materialization order and emit
one event per changed item.

The package exports `onACLChange(handler)` as a precisely typed named-event
consumer helper. ACL change notification is optional, so `aclPlugin()` installs
one internal no-op consumer to satisfy Core's explicit-consumer invariant. An
application or future audit plugin may add consumers without changing ACL
behavior. No realtime or transport plugin consumes or publishes this event by
default.

### Finalization retains projected output

Runtime validates business results before final monotonic field restrictions.
The transaction hook journal snapshots that already validated public result; it
does not structurally revalidate it after protected required fields have been
removed. Complete private adapter materializations remain the source for field
changes.

## Consequences

- ACL authorization stays exclusively in native Access.
- Developers configure business schema and field hooks once; ACL adds no
  parallel hook vocabulary.
- Audit plugins receive stable post-commit identity and diffs without querying
  ACL internals.
- Equivalent reconstructed ACL values produce no event.
- Optional observation remains explicit and transport-neutral, while rollback
  cannot leak an uncommitted ACL transition.
