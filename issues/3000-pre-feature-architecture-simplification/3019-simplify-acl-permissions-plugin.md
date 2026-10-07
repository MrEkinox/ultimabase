# 3019: Simplify the ACL Permissions plugin

- Status: completed
- Milestone: 30
- Packages: `@ultimabase/acl-permissions-plugin`
- Depends on: 3018
- ADR: retained ACL and protected-policy decisions; new ADR only if the stop protocol approves a boundary change

## Goal

Simplify ACL compilation, storage constraints, and enforcement while preserving
its independent monotonic policy and generic Core boundary.

## Acceptance criteria

- [x] Baseline ACL field declaration, codecs, policy compilation, adapter
      constraints, subject matching, maintenance, exports, and tests.
- [x] Remove duplicate schema traversal, normalization, query shaping, command
      mapping, and transport facts replaced by retained kernel projections.
- [x] Preserve owner, role, and public grants, AND-only row filtering,
      operation and field restrictions, nested writes, relations, maintenance,
      wire codecs, Master behavior, and composition with or without Access.
- [x] Keep ACL independent from `@ultimabase/access-plugin`; Core and Access
      must not acquire ACL vocabulary or configuration.
- [x] Change no public behavior, configuration, export, or error without an
      architecture stop and explicit user approval.
- [x] Review the affected ACL pages under `apps/website/content/docs` and, when
      required, update them and the package README in the same audited issue.

## Tests

- [x] Source and packed types, JavaScript, policy monotonicity, subjects, Roles,
      nested writes, relations, REST, GraphQL, Master, and PostgreSQL suites pass
      with unchanged coverage evidence.

## Audit gate

- [x] Audit for policy broadening, Access coupling, constraint loss, product
      vocabulary in Core, duplicate paths, and stale codecs. Correct and repeat
      until green.
- [x] Record package metrics, contract-matrix reconciliation, and Documentation
      impact before completion.

## Out of scope

- Resuming the paused ACL feature backlog or adding new grants.

## Implementation and preservation audit

ACL event collection now consumes Core's typed, validated mutation snapshots
directly. The removed private adapter only converted those snapshots into
another pair object and supported legacy `items` / `originalItem` shapes with
no remaining producer or caller. Core still validates and freezes adapter and
behavior outcomes before this boundary; ACL still checks its own value and
identity, ignores object deletions, compares canonical documents, and queues
changes only after commit. No protocol or public export is removed.

Persistent role aliases are unioned by the existing `ACL.fromJSON()` canonical
parser instead of a second local map before that same parser. The current alias
convergence test retains both rights in one stored entry. The internal operation
mapping now returns its actual zero-or-one permission, removing the unreachable
multi-permission combination. The resulting row predicates and Core's AND-only
composition with other policies are unchanged.

| Metric                             | Before (`e6ba1934`) |       After |
| ---------------------------------- | ------------------: | ----------: |
| Production source files / lines    |          19 / 3,725 |  18 / 3,581 |
| Public exports / declaration bytes |         42 / 19,465 | 42 / 19,465 |
| Factory options / schema options   |               1 / 1 |       1 / 1 |
| Capability providers / privileges  |               8 / 5 |       8 / 5 |

The existing oversized factory shrinks from 883 to 863 lines, and its central
budget baseline is reduced accordingly. Request caches, resolver attribution,
reference cleanup scopes, replacement-shape invariants, Master bypass separation,
entry limits, immutable ACL state and REST/GraphQL/storage codecs are retained.
They protect distinct current boundaries; merging them would obscure behavior
or introduce an unapproved contract. B-001–B-012 and P-002/P-004/P-010–P-014/
P-016–P-018/P-020/P-021 remain preserved. Core and Access acquire no ACL dependency
or product vocabulary. No paused ACL feature work is resumed.

Documentation impact: internal engineering documentation.
The package README and owned website Object ACLs page were reviewed. Their
rights, defaults, Master restrictions, canonical JSON, role resolution, limits,
transport codecs and committed-event behavior remain accurate, so neither
needs a public edit for these private implementation reductions.

Validation and final audit:

- All 79 package unit/type tests pass. Root typecheck, package build, ESLint
  and constraints pass; built declarations are byte-identical.
- The package tests, all source integration suites and Core's malformed-outcome
  boundary suite pass: 333 tests across 90 files, 135.38 s. Coverage collection
  is scoped to ACL with the repository thresholds and exclusions unchanged.
  Comparing its 18 retained maps to the full 3018 report finds no lost covered
  location. All 43 edited/deleted records were reviewed; surviving callbacks
  retain the same hit counts (217 event collections, 211 row predicates,
  11 persistent-role resolutions). The removed map is the obsolete adapter.
- Built integration validation passes: 43 tests across 15 files, covering ACL,
  Roles, reference cleanup, authentication, nested writes, REST and GraphQL.
- Existing unit assertions were adapted only to the private single-permission
  return type. No scenario or error expectation is dropped. The final complete
  diff audit finds no unresolved defect or work outside the issue criteria.
