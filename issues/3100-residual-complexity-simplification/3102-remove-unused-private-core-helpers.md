# 3102: Remove proven unused private Core helpers

- Status: completed
- Milestone: 31
- Packages: @ultimabase/core
- Depends on: 3101
- Execution contract: [milestone 31 plan](../../docs/plans/2026-09-21-residual-complexity-simplification.md)
- Evidence: [candidate inventory](../../docs/plans/2026-09-21-residual-complexity-inventory.md)

## Goal

Delete the private Core functions proven unreachable by 3101 while retaining the live declaration and compilation paths.

## Acceptance criteria

- [x] Recheck the 11 initially listed Core functions plus the additional private helper identified by the 3101 refresh immediately before deletion. Remove their exclusive imports, private state and obsolete branches only where no live consumer remains.
- [x] The 3101 refresh corrects the initial runPluginDeclarationFactory attribution: this four-line helper and declaration-targets.ts have no importing module or public export. Remove that isolated module after rechecking its reachability; keep the live compiler selector, option normalization, field provenance, structural validation, index and decimal behavior.
- [x] Keep source and built public export sets, inferred types, errors and runtime behavior unchanged. A newly discovered public or invariant consumer invokes the stop gate.
- [x] Review packages/core/examples/schema for every schema-domain edit; update examples only if needed to keep the existing contract truthful.
- [x] Record delivered removals and exact production deltas in the inventory and root history. Do not include compiler redesign or public protocol removal.

## Tests

- [x] Run affected schema/declaration/compiler runtime and type tests, public source/built export checks and relevant packed conformance.
- [x] Run the implementation gates in the plan; compare affected retained coverage and avoid deletion-only tests that merely restate missing private functions.

## Audit and commit gate

- [x] Audit the complete diff against retained behavior, security, ownership,
      public types/exports, obsolete paths, tests, documentation and scope.
- [x] Correct every finding, rerun affected checks and repeat the complete audit
      until no finding remains. Architecture questions or blocked verification
      stop the issue for user direction; they are not bypassed by more retries.
- [x] Record audit iterations, validation evidence and exactly one Documentation
      impact classification in the handoff; update inventory/removal history.
- [x] Create the dedicated local commit only after the green audit, report exact
      added/deleted/net line counts and verify scope before the next issue.
      No push is authorized.

## Out of scope

IR replacement, public API changes, blanket file deletion or removal of provenance checks.

## Handoff

Started from `4df180bc` after the 3101 commit. Reachability rechecked; private
removals are implemented, validated and audited.

### Implementation and audit evidence

Removed the 11 initial Core functions, the additional four-line helper and
its isolated 151-line declaration-target module. Removed the two exclusive
selector readers and unused imports. This deletes 334 production lines across
seven files, with no added production code, replacement API or test deletion.

The immediate pre-removal identifier/module search found no callers or public
exports. All 17 instrumented function bodies removed (including nested mapper
callbacks) had zero baseline executions. A TypeScript AST comparison confirms
all 63 retained top-level definitions in the six surviving files are textually
identical. The live canonical selector, sameOwner provenance checks, index
normalization, field capture and exact decimal delta implementations remain.
No coverage exclusion or threshold changes; full coverage will be compared
again at the final gate, without treating deleted dead code as added coverage.

Reviewed the Core README, website Schemas/Fields pages and schema examples
(field options, field builder, plugin transformations, inference/registry).
They describe retained public paths and require no edit. No oversized-file
baseline applies to the affected files.

Audit iteration 1 found relative evidence links would break when deleting the
isolated module. They now identify its historical 3101 path in plain text.
The first full source run passed 2,522 tests and failed 14 listener/browser tests
because the sandbox rejected local ports with EPERM. Re-running the three
affected files with local network access passes all 15 tests. This resolved
an environmental restriction without source/test changes. Typecheck, lint
(zero errors; pre-existing line-budget warnings) and constraints pass.
The canonical build passes attw/publint for all 23 packages. Their 1,726 public
export names and all 23 declaration-file hashes exactly match 3101. The focused
source/type run passes 681 tests; all 2,536 root source/type/performance scenarios
pass across the initial run and environmental retry; 33 relevant packed
archive/field-builder/schema-target/selector tests pass. Formatting, metadata,
relative links and diff whitespace checks pass.

Audit iteration 2 rechecked the complete change against retained behavior,
security/ownership, public types, remaining references, unchanged test scenarios
and coverage configuration, documentation and approved scope. No unresolved
finding. Only the 3101-authorized private removals and their exclusive support
were deleted; no scope expansion.

Documentation impact: internal engineering documentation. The issue, candidate
ledger, execution pointers and root removal history record the delivery. The
public website and README remain accurate for the unchanged field/index/plugin
contracts, so no public copy edit is needed.

Measured production: 127,093 -> 126,759 lines; Core: 68,780 -> 68,446 lines.
Tests/support remain 130,820 lines and tooling 2,119. The dedicated local commit
will be inspected and its complete line counts reported before starting 3103.
No push is authorized.
