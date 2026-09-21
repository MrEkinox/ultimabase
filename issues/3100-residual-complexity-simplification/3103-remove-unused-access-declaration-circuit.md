# 3103: Remove the unused Access declaration circuit

- Status: completed
- Milestone: 31
- Packages: @ultimabase/access-plugin
- Depends on: 3102
- Execution contract: [milestone 31 plan](../../docs/plans/2026-09-21-residual-complexity-simplification.md)
- Evidence: [candidate inventory](../../docs/plans/2026-09-21-residual-complexity-inventory.md)

## Goal

Remove the empty side registry and unused normalization path without changing the current Access option/provider engine.

## Acceptance criteria

- [x] Reconfirm the unused schemaAccessDeclarations WeakMap, declareSchemaAccess/getSchemaAccessDeclarations circuit and normalizeRelationFieldAccessDeclarations. Remove only the unreachable circuit and exclusive dependencies.
- [x] Check splitFieldAccessOptions separately: it has a self-test, so removal requires proving its semantics are already represented in the live option path. Preserve any retained regression scenario.
- [x] Preserve current direct Access declarations, compatible provider composition, relation policies, operation/item/field enforcement, callback ownership, Master bypass and monotonic output restrictions.
- [x] Verify source/packed exports and inference remain equivalent. Core and Access must not acquire Soft Delete or authentication vocabulary.
- [x] Record exact removals and retained test coverage. Review the website Access page; record why no public edit is needed if its contract remains accurate.

## Tests

- [x] Run Access authoring, field/relation, provider, security and type tests plus affected built/PostgreSQL conformance.
- [x] Run the plan's implementation gates and retained-coverage comparison.

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

New permissions, removal of real rule normalization, changing Access public syntax or cross-plugin coupling.

## Handoff

Started after commit `040e7df1`. Reference and live option-path checks complete;
removals and transferred regression cases are validated.

### Removal and retained regression evidence

Removed the unused schema declaration WeakMap and writer/reader, the unused
relation normalizer, and splitFieldAccessOptions with its private-only test.
The current normalizers, option owners and policy compiler remain unchanged:
all 34 retained definitions in the edited production files are text-identical.
Production delta: -100 lines, no replacement production code or public API.

The removed helper's three tests are transferred to options.test.ts against
current public compilation/factory paths. They preserve ordinary metadata with
no policy, normalized policy plus other metadata, and malformed-option
rejection; they additionally assert policy snapshotting and exact ownership.
The helper's original object identity and Access-stripping conventions are
private obsolete mechanics: the live engine already stores normalized opaque
Access in field.options and reads it there. The new tests passed against the
pre-removal implementation before the dead circuit was removed.

The initial transferred test used the wrong failure phase for the unit fixture's
eager schema compilation; its malformed-input check now uses the public field
factory. Strict type validation also required explicitly checking the compiled
field and asserting its generic options without unsafe casts. The corrected
focused runtime/type suite passes 49 tests with no errors. Root validation passes all 2,536 source/type/performance tests in 533 files,
plus typecheck, lint and constraints. The canonical build passes attw/publint. All 23 complete declaration hashes and
1,726 public export names remain identical to 3101. Full coverage passes 2,779 tests in 607 files, with no type error. All 13
built Access/provider/PostgreSQL conformance cases pass. Compared with 3101,
692 production files keep identical coverage maps and eight edited files map
retained locations without regression. The two missing files are exactly the
removed private modules. Every unmapped location belongs to deleted code;
covered top-level initializers are distinguished from unexecuted function bodies.
The covered split helper is accounted for by the three transferred scenarios.
Coverage is 90.29% statements, 83.63% branches, 95.77% functions and 90.91%
lines; denominator reduction is not new behavioral coverage.

Reviewed the Access README and website Access page. Direct rules, provider
composition, field/relation policies, Master bypass and ownership described
there remain unchanged. No Core edit or plugin-specific permission vocabulary
is introduced. No file-size baseline requires adjustment.

Audit iteration 1 established the real option path and transferred the useful
self-test scenarios, correcting their failure phase and precise field narrowing.
Audit iteration 2 removed untyped reflective reads from the new assertions;
the final Access runtime/type suite passes 34 tests and focused lint passes.
This assertion-only refinement changes no production or covered scenario.
Audit iteration 3 reviewed the full diff for parity, security/ownership, public
exports/types, remaining references, coverage/scenarios, documentation and
scope. No unresolved finding, threshold change or extra public removal.
Formatting, issue metadata, relative links and diff whitespace checks pass.

Documentation impact: internal engineering documentation. The ledger, history
and execution pointers record the private cleanup. The reviewed public Access
page and README still accurately describe the unchanged option/provider engine.

Production: 126,759 -> 126,659 lines; Access: 5,185 -> 5,085. Tests replace 31
obsolete helper-test lines with 66 current-path test lines (+35); production
contains no additions. Report complete commit counts before starting 3104.
No push is authorized.
