# ADR-0274: Core owns canonical cooperative cancellation failures

- Status: accepted
- Date: 2026-09-27
- Refines: ADR-0042, ADR-0106, ADR-0189
- Approval: user authorized the canonical Core helper on 2026-09-27

## Context

Core Runtime and the optional Hooks engine must observe the same `AbortSignal`
at safe cooperative boundaries and produce the same transport-neutral
`OPERATION_CANCELLED` failure. Both packages currently contain the same helper,
including timeout normalization, public messaging, and protected diagnostic
details. The copies differ only in how they import `FrameworkError`.

Keeping those implementations separate adds code and allows an official plugin
to drift from Core's error contract. Moving the helper to `@ultimabase/shared`
would invert package responsibilities because Shared cannot construct a Core
`FrameworkError`.

## Decision

`@ultimabase/core` exports
`throwIfOperationCancelled(signal, internalDetails?)` from its package root.
The helper returns normally while the signal is active. Once aborted, it throws
the existing `FrameworkError` with code `OPERATION_CANCELLED`, the existing
public message, and immutable internal details whose `reason` is normalized to
`deadline-exceeded` for native timeout-shaped errors or `request-aborted`
otherwise. The arbitrary `AbortSignal.reason` value is never copied.

Caller-provided internal details are retained, except that the canonical
normalized `reason` always wins. The helper does not abort a signal, race or
detach asynchronous work, create transaction state, or decide where a safe
cancellation checkpoint belongs.

Core Runtime continues to use the same implementation internally. The official
Hooks engine imports that public helper and removes its local copy. Community
plugins may use it at their own safe cooperative boundaries without receiving
Runtime, transaction, authority, or lifecycle access.

## Consequences

- Core and every plugin can produce one stable cancellation failure without
  duplicating error construction or timeout classification.
- Hooks retains its existing cancellation timing and diagnostic behavior.
- The new root export is a small public authoring convenience, not a capability
  or privilege and not a promise of forced JavaScript cancellation.
- Changes to cancellation error construction now have one implementation and
  require the ordinary public error review.

## Rejected alternatives

- Keeping the Hooks copy would preserve the proven duplication and drift risk.
- Moving the implementation to Shared would give a foundational utility package
  responsibility for a Core-owned error contract.
- Exposing a configurable cancellation-error factory would add flexibility with
  no current consumer and weaken the canonical error shape.
