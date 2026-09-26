# Milestone 49 — Attributed callback runtime

- Status: completed
- Authorization: user request of 2026-09-26
- Baseline: `e63e07b6`

This milestone makes Core's application-bound callback attribution and recursion
stack the single mechanism used by Core Runtime, Access, and Hooks. Product
engines keep their own cancellation, diagnostics, query guards, lifetime
closing, and public errors.

## Execution order

- [x] [4901 — Audit attributed callback consolidation](4901-consolidate-attributed-callback-execution.md)

## Constraints

- Preserve exact callback ownership and optional plugin instance identity.
- Preserve Access fail-closed behavior and Hooks event/finalization behavior.
- Add no Runtime stage, registry, capability, privilege, or product vocabulary
  to Core.
- Stop before implementation if sharing the mechanism would weaken either
  product contract.

No push is authorized.

## Outcome

The implementation spike preserved the three products' behavior, but the
smallest honest shared facade added 309 and removed 221 production lines: a net
increase of 88. Core had to expose generic frame comparison, recursion error,
observation, nesting-depth, owner-dispatch, and stack-exit seams so Access and
Hooks could retain their intentionally different diagnostics and lifetimes.

Moving those product-specific policies into Core would violate the milestone's
constraints and recreate the bridge architecture this debt program is removing.
The spike was therefore fully reverted. No production, test, public API, or
documentation behavior changed.
