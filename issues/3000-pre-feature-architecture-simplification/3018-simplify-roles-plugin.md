# 3018: Simplify the Roles plugin

- Status: completed
- Milestone: 30
- Packages: `@ultimabase/roles-plugin`
- Depends on: 3017
- ADR: retained Roles decisions; new ADR only if the stop protocol approves a boundary change

## Goal

Simplify schema-backed Roles and membership maintenance without introducing a
parallel identity or persistence system.

## Acceptance criteria

- [x] Baseline Role schema specialization, references, membership and hierarchy
      checks, deletion maintenance, Master elevation, exports, and tests.
- [x] Remove duplicate schema, command, query, lifecycle, and result plumbing
      made unnecessary by the simplified Core and canonical graph.
- [x] Preserve developer-defined fields and indexes, immutable role references,
      transitive membership, cycle handling, deletion policies, transaction
      behavior, subject contributions, optional Access and Hooks composition,
      and audited internal Master work.
- [x] Keep Roles from granting authorization by itself or depending on a
      concrete transport.
- [x] Change no public behavior, configuration, export, or error without an
      architecture stop and explicit user approval.
- [x] Review the affected Roles pages under `apps/website/content/docs` and,
      when required, update them and the package README in the same audited
      issue.

## Tests

- [x] Source and packed types, JavaScript, hierarchy, membership, deletion,
      transactions, Access, Hooks, authentication subjects, and PostgreSQL
      suites pass with unchanged coverage evidence.

## Audit gate

- [x] Audit for authority leaks, duplicate repositories, stale memberships,
      changed cycles or deletion behavior, and speculative abstractions. Correct
      and repeat until green.
- [x] Record package metrics, contract-matrix reconciliation, and Documentation
      impact before completion.

## Out of scope

- Adding organization, group, invitation, or transport features.

## Implementation and preservation audit

The hierarchy guard now only checks cycles and the existing traversal bounds.
Its former second traversal, shortest-path maps, sorted snapshots and unused
live-resolution wrapper had no product consumer: Runtime discarded that result,
and one private helper test was its only reader. The independent membership
resolver still computes and memoizes the exact direct/ancestor snapshot used by
Access and ACL. The overlapping-path test now checks that each shared subtree
is read once; membership tests retain shortest-path and immutability coverage.

Role events reuse the relation changes already parsed for hierarchy checks.
Deletion cleanup, authority elevation, target loading and event ordering remain
unchanged. The old private set-based deletion guard and its isolated helper test
are removed: ADR-0164 and commit `87a20ad9` deliberately disconnected it when
public collection mutations became atomic singular batches. The replacement
integration checks that a later role-policy failure rolls back an earlier
batch deletion and queued events, then verifies successful ordered deletion.
The public `RoleDeletionError` constructor and its accepted code union remain
unchanged; removing an error code would be a separate public decision.

| Metric                             | Before (`0f5fe233`) |       After |
| ---------------------------------- | ------------------: | ----------: |
| Production source files / lines    |          12 / 2,397 |  12 / 2,313 |
| Public exports / declaration bytes |         40 / 18,614 | 40 / 18,614 |
| Factory options / Runtime stages   |               0 / 3 |       0 / 3 |

Built declarations are byte-identical. Schema identity, normalization, reserved
fields, model aliases, exact member types, role references, request caches,
fail/preserve/cascade policy, audited Master work and neutral cleanup/subject
protocols stay in their current owners. No Core, authority or capability API is
changed. B-001–B-012 and P-002/P-010–P-012/P-018/P-020/P-021 remain preserved.
The package already uses ordinary schema and Query execution; no repository,
identity system or shared abstraction is introduced to replace it.

Documentation impact: both.
The README and owned website Roles page correct the stale claim that
`deleteMany()` is always rejected, describing the already accepted ADR-0164
behavior. The README also describes the actual direct/ancestor membership
snapshot. This issue changes no public deletion policy or hierarchy behavior.

Validation evidence:

- Package unit/type tests: 42 pass; the obsolete private-guard test is replaced
  by the collection integration, not by weakening deletion-policy checks.
- Built Roles, ACL role/cleanup, authenticated REST and Access composition
  suites: 22 tests across five files pass, including collection rollback.
- Root typecheck, package build, ESLint and dependency constraints pass.
  The new integration's shared options were explicitly typed after the first
  check caught TypeScript widening its `true` Master flag to `boolean`.
- Website validation: all 66 tests across 17 files pass. No Next.js code,
  rendering component or browser behavior changes.
- Full source coverage: 2,778 tests across 607 files pass (452.71 s). All
  703 retained source maps are compared to 3017, with no lost covered location.
  The one missing map is Validation's unused fixture removed in 3017 after its
  global run. The 56 edited/deleted coverage records match the removed private
  calculations and guard; hierarchy visits remain 47 and database child reads
  remain 25, while the graph still raises the same six tested failures.
- Final audit: no unresolved finding, additional public removal, new abstraction
  or work outside the acceptance criteria. No coverage setting is changed.
