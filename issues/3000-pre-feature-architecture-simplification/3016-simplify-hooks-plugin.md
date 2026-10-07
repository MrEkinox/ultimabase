# 3016: Simplify the Hooks plugin

- Status: completed
- Milestone: 30
- Packages: `@ultimabase/hooks-plugin`
- Depends on: 3015
- ADR: retained Hooks and public-kernel decisions; new ADR only if the stop protocol approves a boundary change

## Goal

Simplify official Hooks declaration and dispatch while preserving lifecycle,
ordering, attribution, transaction, and event behavior.

## Acceptance criteria

- [x] Baseline the package's declarations, normalized forms, phase dispatch,
      event paths, diagnostics, exports, and tests against the contract matrix.
- [x] Remove duplicated command lookup, normalization, registration, projection,
      and phase-routing work replaced by the canonical graph.
- [x] Preserve dependency and registration ordering, field and schema input
      resolution, logical operation identity, nested-write context, before and
      after transaction behavior, beforeCommit, afterCommit, events, callback
      attribution, compatible providers, and diagnostics.
- [x] Keep Hooks independent from Access and product-specific operations.
- [x] Change no public behavior, configuration, export, or error without an
      architecture stop and explicit user approval.
- [x] Review the affected Hooks pages under `apps/website/content/docs` and,
      when required, update them and the package README in the same audited
      issue.

## Tests

- [x] Source and packed types, JavaScript, conformance, ordering, schema
      mutations, nested writes, rollback, events, diagnostics, Master, and
      PostgreSQL suites pass with unchanged coverage evidence.

## Audit gate

- [x] Audit the full diff for reordered callbacks, transaction escape,
      duplicated dispatch, lost attribution, product vocabulary, and needless
      abstractions. Correct and repeat until green.
- [x] Record package metrics, contract-matrix reconciliation, and Documentation
      impact before completion.

## Out of scope

- Adding Hook phases, asynchronous jobs, or a product-specific lifecycle.

## Implementation and preservation audit

Removed two private field-order arrays with no Runtime reader, the unused
`runHookObservers` path and its private cancellation forwarding option, unused
loop-index arguments, duplicate update/delete phase-plan objects, and the
extra save-plan factory. After-order is now derived by reversing the exact
before nesting instead of separately assembling the same sequence. Existing
field lookups, provenance and handler declaration indexes remain unchanged.

Schema transformation now names its only used phase, `resolveInput`, directly;
the internal arbitrary phase list/direction and loop are gone. Field resolution
owns its existing read/delete early return, avoiding a forwarding wrapper and
repeated family lookup. Native/custom logical command separation, input and
result snapshots, target checks and errors retain their original order.

The observer helper had no call site. Live post-commit event dispatch remains
inside `HookExecutionRuntime`, including non-cancellable delivery, independent
consumer failures, exact owner attribution and transaction buffering. Core's
commit boundaries are preserved; this issue does not reintroduce schema-level
transaction hooks removed by ADR-0172. Cancellation, recursion, diagnostics,
HookContext revocation and nested-query lifetime tracking remain untouched.

| Metric                      | Before (`4d6faa2a`) |  After |
| --------------------------- | ------------------: | -----: |
| Production TypeScript files |                  33 |     33 |
| Production lines            |               5,620 |  5,528 |
| Public exports              |                 102 |    102 |
| Entry declaration bytes     |              47,914 | 47,914 |
| Frozen native phase plans   |                   7 |      5 |
| Runtime behavior callbacks  |                   6 |      6 |
| Package unit/type tests     |                  83 |     83 |

Built declarations are byte-identical. Two private-shape assertions for the
removed unused arrays now verify the retained field path and its immutability;
no runtime scenario or test is deleted. Schema/field normalization, immutable
contribution plans, the canonical mutation surface and all three Hooks-owned
capability protocols remain necessary and unchanged. There is no new Core or
cross-plugin dependency, public API, option, error, phase or helper abstraction.

B-001–B-008/B-010–B-012 and P-002/P-007/P-010–P-014/P-018/P-019/P-022 retain
logical lifecycle, transactions, type/JS/transport parity, attribution and
optional-engine behavior. C-011/C-012/C-013 and consumed C-006 remain intact;
no contract-matrix removal or architectural decision is added.

Documentation impact: both.
The owned website Hooks page now names the actual `RUNTIME_CALLBACK_RECURSION`
error and cites its implementation. The README separates Core's mandatory
structural validation from the optional Validation plugin's Standard Schema
guard. These correct existing prose; no public behavior changed. Phase, ordering,
transaction and event examples remain accurate.

### Validation and audit loop

The first typecheck found two imports made unused by removing the forwarding
function. They were removed and the package's 83 unit/type tests, root typecheck,
package build and package lint all pass (only the two pre-existing line-budget
warnings). Dependency constraints pass. The complete source coverage suite
passes 2,778 tests / 608 files in 445.27 seconds, with unchanged thresholds,
exclusions and timeouts.

Coverage is compared against the exact 3015 baseline over all 704 production
files, translating unchanged source lines in the edited files. There is no lost
coverage among 27,530 statements, 5,429 functions, 18,483 branch arms and 26,549
comparable line locations. The 53 records spanning edited/deleted source were
reviewed: unused observer code, list assembly, phase objects, removed wrappers
and the flattened single-phase loop account for them. Transform/effect chains
still run 606/655 times; schema resolution still runs 507 times, field handlers
99 times, and before/after handlers 125/90 times. The discarded observer path
had zero invocations before the change.

Hooks coverage changes from 856/946 to 838/922 statements and 190/200 to
188/197 functions; branches remain exactly 422/511. No runtime scenario was
removed. Global percentages are 89.80% statements, 83.04% branches, 95.31%
functions and 90.41% lines. No performance or hosted-CI gain is claimed.

Evidence: `/tmp/ultimabase-3016-{before,after}.json`,
`/tmp/ultimabase-3016-hooks-tests.log`, `/tmp/ultimabase-3016-coverage-tests.json`,
`/tmp/ultimabase-3016-coverage/coverage-final.json` and
`/tmp/ultimabase-3016-coverage-comparison.json`.

The affected built-export integration suites pass 38 tests / 10 files, covering
Hooks conformance, PostgreSQL, independent engines, transport protection and
nested mutations. Website validation passes all 66 tests. A redundant source
metadata entry noticed during the documentation audit was removed.
The final full-diff re-audit has no unresolved finding, lost callback order,
transaction escape, public change or speculative abstraction. No production
work exceeds this issue. Nothing is pushed.
