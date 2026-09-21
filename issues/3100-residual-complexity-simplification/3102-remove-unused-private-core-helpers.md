# 3102: Remove proven unused private Core helpers

- Status: planned
- Milestone: 31
- Packages: @ultimabase/core
- Depends on: 3101
- Execution contract: [milestone 31 plan](../../docs/plans/2026-09-21-residual-complexity-simplification.md)
- Evidence: [candidate inventory](../../docs/plans/2026-09-21-residual-complexity-inventory.md)

## Goal

Delete the private Core functions proven unreachable by 3101 while retaining the live declaration and compilation paths.

## Acceptance criteria

- [ ] Recheck the 11 Core functions listed under RC-01 immediately before deletion. Remove their exclusive imports, private state and obsolete branches only where no live consumer remains.
- [ ] Keep runPluginDeclarationFactory in declaration-targets.ts and the live compiler selector, option normalization, field provenance, structural validation, index and decimal behavior.
- [ ] Keep source and built public export sets, inferred types, errors and runtime behavior unchanged. A newly discovered public or invariant consumer invokes the stop gate.
- [ ] Review packages/core/examples/schema for every schema-domain edit; update examples only if needed to keep the existing contract truthful.
- [ ] Record delivered removals and exact production deltas in the inventory and root history. Do not include compiler redesign or public protocol removal.

## Tests

- [ ] Run affected schema/declaration/compiler runtime and type tests, public source/built export checks and relevant packed conformance.
- [ ] Run the implementation gates in the plan; compare affected retained coverage and avoid deletion-only tests that merely restate missing private functions.

## Audit and commit gate

- [ ] Audit the complete diff against retained behavior, security, ownership,
      public types/exports, obsolete paths, tests, documentation and scope.
- [ ] Correct every finding, rerun affected checks and repeat the complete audit
      until no finding remains. Architecture questions or blocked verification
      stop the issue for user direction; they are not bypassed by more retries.
- [ ] Record audit iterations, validation evidence and exactly one Documentation
      impact classification in the handoff; update inventory/removal history.
- [ ] Create the dedicated local commit only after the green audit, report exact
      added/deleted/net line counts and verify scope before the next issue.
      No push is authorized.

## Out of scope

IR replacement, public API changes, blanket file deletion or removal of provenance checks.

## Handoff

Not started. The preparation request does not authorize implementation.
