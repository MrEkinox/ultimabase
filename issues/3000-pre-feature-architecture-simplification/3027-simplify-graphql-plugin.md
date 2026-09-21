# 3027: Simplify the GraphQL plugin

- Status: completed
- Milestone: 30
- Packages: `@ultimabase/graphql-plugin`
- Depends on: 3026
- ADR: retained GraphQL and canonical transport-projection decisions

## Goal

Simplify network-independent GraphQL compilation and execution around the
canonical Core projections without weakening schema or request safety.

## Acceptance criteria

- [x] Baseline generated schema, custom composition, queries, mutations,
      relations, virtual fields, plugin operations, schema mutations, codecs,
      limits, cursors, errors, exports, and tests.
- [x] Remove duplicate transport planners, binding registries, schema facts,
      type builders, validation passes, and late lookup made obsolete by issue 3012.
- [x] Preserve SDL, field names, inputs, outputs, selection and inclusion,
      pagination, signed cursor semantics, custom schema composition, context
      validation, safe errors, limits, direct execution, and authorization
      neutrality.
- [x] Preserve Password Auth, Soft Delete, custom fields, nested writes,
      contextual relations, virtual results, and Master-only exclusion without
      importing their packages.
- [x] Keep GraphQL network-independent and free from Yoga, HTTP, REST, and
      database ownership.
- [x] Change no public behavior, configuration, export, schema, cursor, or error
      without an architecture stop and explicit user approval.
- [x] Review the affected GraphQL pages and guides under
      `apps/website/content/docs` and, when required, update them, runnable
      examples, and the package README in the same audited issue.

## Tests

- [x] SDL snapshots, source and packed types, JavaScript, direct execution,
      custom composition, limits, cursors, operations, mutations, relations,
      virtual fields, policy, safe errors, and PostgreSQL suites pass with
      unchanged coverage evidence.

## Audit gate

- [x] Audit every generated and custom field back to one retained contract and
      check for schema drift, authority leaks, duplicate facts, stale builders,
      and product coupling. Correct and repeat until green.
- [x] Record package metrics, contract-matrix reconciliation, and Documentation
      impact before completion.

## Out of scope

- Subscriptions, federation, new schema fields, or cursor redesign.

## Implementation and preservation audit

The 52-module baseline covers schema exposure, generated and custom composition,
field/filter/input/output builders, exact operation bindings, selected schema
mutations, networkless execution, attribution, limits, safe errors and signed
connections. The canonical command plans remain Core-owned. GraphQL's generated
schema validation and final composition validation have different inputs and
error contracts; neither is removed. Type caches still terminate recursive
thunks and preserve identity, while exact operation indexes and the selected
schema-mutation set enforce distinct current allowlists.

Application and command bridges now remove their private WeakMap entry at
disposal. This replaces three disposed flags and the partially cleared state
with one unavailable state, preserving error messages, idempotence, frozen
facades and rejection of execution/rebinding. Cursor disposal still happens
first and erases its key. No cursor, request-scope or security logic changes.

The binding type compiler and schema-mutation compiler reuse the final compiled
schema registry instead of rebuilding two equivalent class-name maps. All
schemas had already entered the surface map, so the available identities and
ownership checks are identical. Supporting-type registration order comes from
the existing insertion-ordered definition map instead of a second name array.
A shared private owner projection serves both binding families; enums and
embedded objects reuse the same field-type naming function. The main compiler
calls its filter compiler directly instead of through two read-compiler relays.

Production changes from 52 files / 8,710 lines to 52 / 8,662 (-48). All 33
exports and 11,903 declaration bytes are byte-identical. SDL names, nullability,
operation selection, nested writes, plugin fields, virtual outputs, contextual
relations, custom schemas, error provenance, limits, cursor signatures and
lifecycle behavior remain unchanged. No Core, HTTP, Yoga, REST, database,
authentication or policy package changes. B-001–B-008/B-010–B-012 and
P-004–P-007/P-009–P-011/P-017/P-020/P-022/P-023 are reconciled.

Documentation impact: internal engineering documentation.
The package README, GraphQL website page and Operations and GraphQL authoring
guide were reviewed. Their existing direct-execution, composition, schema,
command, cursor and disposal contracts remain accurate, so no public edit is
needed.

Validation evidence:

- The initial 106 package unit/type checks pass across 21 files (15.94 s).
  Root typecheck and build pass. Audit corrected two optional-chain lint
  findings; the repeated checks pass with the existing file-size warning only.
- All 361 scoped package/source integration tests pass across 96 files
  (132.64 s), with no type error. The command exits nonzero because the global
  88% statement / 80% branch thresholds are applied to GraphQL alone; the
  unchanged baseline package already fell below both. Thresholds remain intact
  and the complete repository coverage run is required before completion.
- Scoped comparison retains all 52 maps and loses no retained covered location.
  All 120 changed records were reviewed. Both bridges retain 99 disposals,
  17 / 46 bindings and 22 / 8 executions; the type compiler retains 81 ordered
  inventories and 88 finalizations; the shared owner projection keeps
  150 + 25 = 175 calls. Filter materialization still runs 85 times at the same
  point. No assertion or coverage exclusion changes.
- The full repository coverage run passes all 2,779 tests across 607 files
  (420.14 s), without type errors: 89.93% statements, 83.26% branches,
  95.42% functions and 90.54% lines. Global thresholds pass unchanged. The
  full GraphQL coverage comparison also finds no lost retained covered location.
- All 383 built integrations pass across 97 files (120.65 s), including
  source/packed public contracts, JavaScript, custom composition, policy,
  Password Auth, Soft Delete and PostgreSQL. The final complete diff audit is
  green: no unresolved finding and no work beyond the acceptance criteria.
- All nine backlog metadata checks pass after the final issue handoff.
