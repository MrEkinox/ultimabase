# 3026: Simplify the REST plugin

- Status: completed
- Milestone: 30
- Packages: `@ultimabase/rest-plugin`
- Depends on: 3025
- ADR: retained REST and canonical transport-projection decisions

## Goal

Simplify REST planning, decoding, and response handling around the canonical
Core projections while preserving the complete REST v1 contract.

## Acceptance criteria

- [x] Baseline route generation, schema options, queries, mutations, plugin
      operations, schema mutations, codecs, limits, errors, envelopes, exports,
      and tests.
- [x] Remove duplicate planners, binding comparisons, operation registries,
      schema traversals, codecs adapters, and late lookup made obsolete by issue 3012.
- [x] Preserve current paths, methods, query and mutation inputs, pagination,
      relations, nested writes, virtual outputs, Password Auth routes, Soft
      Delete routes, safe errors, response envelopes, limits, and authorization
      neutrality.
- [x] Keep REST independent from Hono, GraphQL, database adapters, and concrete
      product plugins.
- [x] Change no public behavior, configuration, export, route, payload, or error
      without an architecture stop and explicit user approval.
- [x] Review the affected REST pages and guides under
      `apps/website/content/docs` and, when required, update them, runnable
      examples, and the package README in the same audited issue.

## Tests

- [x] Route snapshots, codecs, direct parity, JavaScript, packed packages,
      Password Auth, Soft Delete, Access, ACL, nested writes, virtual fields,
      browser, and PostgreSQL E2E pass with unchanged coverage evidence.

## Audit gate

- [x] Audit every route back to one canonical Core command or query and check
      for wire drift, policy bypass, duplicate planning, unsafe errors, and
      product coupling. Correct and repeat until green.
- [x] Record package metrics, contract-matrix reconciliation, and Documentation
      impact before completion.

## Out of scope

- REST v2, new routes, compatibility aliases, or client generation.

## Implementation and preservation audit

The baseline covers all 27 production modules: route selection/composition,
request and mutation decoding, stored/virtual/nested codecs, operation and
schema-mutation binding, safe envelopes/errors, limits and HTTP mounting.
Issue 3012 already centralizes executable commands in Core; REST retains only
its protocol projection and the exact executable-exposure checks at binding.
Those checks run at different lifecycle phases and are not a second command
graph. No extra cache or generic planner is introduced to eliminate them.

The unused private application-provenance WeakSet and its unconsumed predicate
are removed. Immutable per-compilation provenance values and the actual route
fragment ownership check remain. Native routes, custom schema mutations and
codec validation now share the same private virtual-output projection. The
identity mapping of native operation option names is removed. HTTP owner
selection reads the existing immutable provenance instead of allocating an
identical identity, and collection/create dispatch no longer handles item/read
branches already consumed immediately above it.

Two catch blocks only rethrew the original error under every condition; they
are removed without moving or changing validation, cancellation, decoding or
execution. Error sanitization at the actual REST response boundary remains.
No public test assertion or codec validation is removed. Frozen transport
facades retain their private state and exact route/version/owner checks.

Production changes from 27 files / 4,955 lines to 27 / 4,875 (-80). All 45
exports and 20,685 declaration bytes are byte-identical. REST v1 paths,
methods, UUID rules, route defaults, payloads, envelopes, declared error
statuses, pagination, limits, nested writes, virtual fields, application
operations, schema commands and explicit REST instances remain unchanged.
B-001–B-008/B-010–B-012 and P-004–P-007/P-009–P-011/P-017/P-020/P-022/P-023
are reconciled with the contract matrix. Concrete policy, authentication,
Soft Delete, Hono, GraphQL and database packages remain unchanged.

Documentation impact: internal engineering documentation.
The package README and REST website page were reviewed against route generation,
body decoding, plugin-operation paths and response encoding. Existing public
examples and explanations remain accurate; no public edit is necessary.

Validation evidence:

- All 103 package unit/type checks pass across 18 files (6.87 s). Root
  typecheck, package build, ESLint and dependency constraints pass.
- All 358 package/boundary/source integration checks pass across 93 files
  (139.03 s). All 27 coverage maps remain. Comparison with the complete 3022
  baseline finds no lost retained covered location; all 119 moved/deleted
  records were reviewed. Dedenting the two execution bodies preserves the
  exact counts of all 102 matched statements and their 62 / 14 command calls.
  The shared virtual-field mapper retains 351 + 194 + 156 = 701 field visits.
  The removed private provenance predicate had zero calls. No threshold,
  exclusion or test assertion changes.
- All 383 built integrations pass across 97 files (120.84 s), including
  JavaScript, packed consumers, REST/GraphQL parity, Password Auth, Soft Delete,
  nested/virtual outputs and policy enforcement. Final complete diff audit:
  green, no unresolved finding and no work beyond acceptance criteria.
- All nine backlog metadata checks pass after the final issue handoff.
