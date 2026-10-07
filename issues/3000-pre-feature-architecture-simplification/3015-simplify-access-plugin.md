# 3015: Simplify the Access plugin

- Status: completed
- Milestone: 30
- Packages: `@ultimabase/access-plugin`
- Depends on: 3014
- ADR: retained Access and public-kernel decisions; new ADR only if the stop protocol approves a boundary change

## Goal

Simplify Access compilation and enforcement on the smaller kernel without
changing its public policy language or monotonic security behavior.

## Acceptance criteria

- [x] Map the package to the contract matrix and measure files, lines, exports,
      compilation stages, normalized forms, callbacks, diagnostics, and tests.
- [x] Remove duplicate normalization, command mapping, registration, projection,
      and lifecycle work made obsolete by the canonical graph.
- [x] Preserve default denial, exact operation and schema-mutation rules, row
      filters, item checks, field restrictions, relation-write enforcement,
      compatible providers, callback attribution, diagnostics, and uniform
      Master bypass.
- [x] Keep Access independent from ACL, Roles, authentication, Soft Delete, and
      product-specific permission names.
- [x] Change no public behavior, configuration, export, or error without an
      architecture stop and explicit user approval.
- [x] Review the Access pages identified by documentation ownership. Apply any
      approved public change to `apps/website/content/docs` and the package
      README in this issue; otherwise record why those pages remain accurate.

## Tests

- [x] Source and packed types, JavaScript, conformance, policy monotonicity,
      relations, nested writes, schema mutations, diagnostics, Master, and
      PostgreSQL suites pass with unchanged coverage evidence.

## Audit gate

- [x] Audit the complete package diff for policy broadening, duplicate paths,
      leaked product vocabulary, lost editor behavior, and speculative helpers.
      Correct findings and repeat until green.
- [x] Record package metrics, contract-matrix reconciliation, and Documentation
      impact before completion.

## Out of scope

- Adding a permission feature or changing an application's policies.

## Implementation and package audit

The runtime now finalizes static selections once for native operations and
custom schema mutations, after their separate logical checks. Removed the
unreferenced internal `enforceRelationPredicateRead` method and its forwarding
helper; caller predicates already reach the live `relation` policy through
Core's `predicate-preparation.ts` and `enforceProtectedRelation`. Removed two
Promise callbacks whose only purpose was discarding successful results before
the existing denial adapter. Other errors still propagate unchanged.

The compilation audit retains the existing normalization → mutable draft →
immutable plan stages: they validate author input, attach exact provenance and
order, then provide immutable execution lookups. They do not duplicate the
canonical command graph. The 13 native terminal mappings still implement the
public cardinality policy; custom mutations use the existing canonical surface.
The two normalized declaration families (schema and field), one protected
policy, seven policy callbacks and two Access-owned capability protocols remain.
No lifecycle or registration layer was added.

A proposed field-identity indexing change was discarded during the audit:
Core already creates distinct normalized field definitions for reused authoring
values, so the hypothesized repeated-copy case did not justify that change.
The final diff leaves compilation untouched. A new regression checks that an
allowed custom mutation with a forbidden explicit selection fails before its
handler or target preparation.

| Metric                      | Before (`23b75027`) |  After |
| --------------------------- | ------------------: | -----: |
| Production TypeScript files |                  29 |     29 |
| Production lines            |               5,227 |  5,185 |
| Public exports              |                  79 |     79 |
| Entry declaration bytes     |              36,909 | 36,909 |
| Package unit/type tests     |                  33 |     34 |

Built `index.d.ts` is byte-identical. There is no new public API, configuration,
error, capability removal, dependency, neutral stage or product vocabulary.
C-001/C-002 (providers/diagnostics) and consumed C-006 (canonical mutations)
remain. B-001–B-008/B-010–B-012 and P-002/P-007/P-010–P-014/P-019/P-021/P-022
retain their relevant schema, policy, authority, typing, plugin-order and
transport contracts; no matrix decision or R-001–R-010 status changes.

Documentation impact: internal engineering documentation.
The package README, website Access page, security-model/Master pages and package
index were reviewed. They already describe the preserved default denial,
monotonic composition, explicit-selection rejection, relation enforcement and
Master bypass. No public website edit is needed for these private removals.
The plan also records the user's explicit resumption through issue 3034.

### Validation and coverage evidence

Package unit/type tests pass (34 tests / 11 files), as do the root typecheck,
all package builds, lint (warnings only), dependency constraints and backlog
metadata tests. The complete source coverage run passes 2,778 tests / 608 files
in 444.89 seconds with unchanged thresholds, exclusions and timeouts.

The comparison against the 3014 JSON normalizes checkout roots and translates
unchanged lines in the two edited production files. Across all 704 production
files, 27,559 statements, 5,432 functions, 18,485 branch arms and 26,579 line
locations retain their prior coverage. No previously covered comparable
location becomes uncovered. The 39 records crossing edited/deleted spans were
reviewed separately: they are the dead relation-predicate path, its merged
forwarder, the duplicated selection tail and the discarded-result callbacks.
The retained relation guard still executes 130 times, and the two policy
callbacks still execute 377 and 141 times. Native/custom dispatch and the shared
selection tail execute, including the added early-denial regression.

Access coverage moves from 918/1,064 to 913/1,055 statements, 182/201 to 179/197
functions and 521/675 to 519/671 branch arms. Removed covered locations are
explained by deduplication, not removed scenarios. Global coverage is 89.78%
statements, 83.04% branches, 95.29% functions and 90.40% lines. No performance
or hosted-CI improvement is inferred from these figures.

Evidence: `/tmp/ultimabase-3015-{before,after}.json`,
`/tmp/ultimabase-3015-coverage-tests.json`,
`/tmp/ultimabase-3015-coverage/coverage-final.json` and
`/tmp/ultimabase-3015-coverage-comparison.json`.

The built-export integration run also passes all 381 tests / 97 files in
119.83 seconds, including PostgreSQL, transport policy parity, JavaScript,
conformance, relations, nested writes, packed types and Master.

### Final audit

Website documentation validation also passes all 66 tests. The second complete
diff audit has no unresolved finding. Exact policy ordering,
error propagation, provider provenance, monotonic effects and Master bypass are
preserved. The unsuccessful identity-indexing experiment is absent from the
final diff. No production scope exceeds the issue; the planning updates merely
record the user's new execution authorization. The unrelated editor setting and
suspended Soft Delete stash are preserved. Nothing is pushed.
