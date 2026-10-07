# 3024: Simplify the HTTP plugin

- Status: completed
- Milestone: 30
- Packages: `@ultimabase/http-plugin`, `@ultimabase/graphql-http`
- Depends on: 3023
- ADR: decision from issue 3002 and retained HTTP decisions

## Goal

Simplify the protocol-neutral Fetch boundary after single-application ownership
is established, while preserving credential and routing safety.

## Acceptance criteria

- [x] Baseline application identity, route and mount composition, original
      headers, credentials, sessions, Master exchange, browser policy, request
      context, timeouts, errors, lifecycle, exports, and tests.
- [x] Remove obsolete application-selection, duplicate route planning, context,
      error, and lifecycle representations left after issues 3007 and 3012.
- [x] Preserve exact route collision rules, original-header evidence, safe
      pre-dispatch failures, CORS and preflight semantics, request cancellation,
      session resolution, non-forgeable Master authority, and transport-neutral
      composition.
- [x] Keep HTTP independent from Hono, REST, GraphQL, Yoga, authentication
      providers, and databases.
- [x] Change no public behavior, configuration, export, header, path, or error
      without an architecture stop and explicit user approval.
- [x] Review the affected HTTP pages under `apps/website/content/docs` and, when
      required, update them and the package READMEs in the same audited issue.

## Tests

- [x] Fetch, routes, mounts, headers, credentials, sessions, Master, CORS,
      preflight, cancellation, lifecycle, source and packed, JavaScript, and
      browser suites pass with unchanged coverage evidence.

## Audit gate

- [x] Audit for credential forgery, unsafe disclosure, route drift, sibling
      imports, stale application maps, duplicate contexts, and resource leaks.
      Correct and repeat until green.
- [x] Record package metrics, contract-matrix reconciliation, and Documentation
      impact before completion.

## Out of scope

- Adding an HTTP framework, protocol, authentication provider, or route.

## Implementation and preservation audit

The baseline covers all 14 HTTP modules and both GraphQL HTTP contract modules:
identity and bootstrap, route ownership/collisions, ordered original headers,
credential masking, anonymous resolver lineage, Master exchange, browser policy,
timeout/cancellation, safe error envelopes, resource disposal and declarations.

HTTP resource fetch and disposal now share their private state directly. The
module-level application-to-state WeakMap and its impossible missing-entry
branches are removed. The optional request executor already becomes unavailable
on disposal and now also marks closed admission, replacing the duplicate boolean.
The three later executor checks remain: disposal during an awaited resolver must
not allow a handler to run. Immutable public authority and timeout configuration
replace their identical private copies. Disposal remains synchronous and
idempotent; stale resources cannot mutate a newer resource.

An endpoint wrapper no longer selects between two identical object expressions.
It still validates handler responses and re-enters the exact plugin owner;
route selection and collision rules are unchanged. Original-header evidence
uses a set for its existing seen-once invariant rather than storing counters
that can never exceed one. Duplicate rejection, original pairs, header order,
request-ID validation and credential masking remain intact. Routes and CORS use
one private readonly method vocabulary instead of two identical sets. Existing
comments about removed generic replacement powers are corrected.

The GraphQL HTTP contract needs no reduction. Its strict same-origin normalized
path validator remains distinct from HTTP endpoint path validation because the
contracts differ. No new shared API, provider, context, endpoint, option, route,
error, compatibility layer or concrete sibling dependency is introduced.

HTTP production remains 14 files and shrinks 2,517 -> 2,499 lines (-18).
Its 64 exports and 19,260 declaration bytes are unchanged; the declaration diff
only moves the identical constants region after the endpoints region. Sorting
regions proves all text and JSDoc are otherwise identical. GraphQL HTTP remains
two files / 82 lines, three exports and 783 byte-identical declaration bytes.
B-004–B-008/B-010–B-012 and P-009–P-011/P-017/P-020/P-022/P-023 are reconciled.

Documentation impact: internal engineering documentation.
Both package READMEs and the owned HTTP website page were reviewed. The sole
owner, exact headers, route/credential boundary, browser policy, lifecycle,
timeout and provider-neutral GraphQL endpoint contracts remain accurate;
no public documentation edit is required.

Validation evidence:

- All 109 focused unit/type checks pass across 17 files (14.98 s). Root
  typecheck, HTTP build, ESLint and dependency constraints pass.
- All 364 package/boundary/source-integration checks pass across 92 files
  (129.77 s). All 16 HTTP/GraphQL HTTP coverage maps are retained. Comparison
  with the complete 3022 report finds no lost covered location; the 39 edited
  records were reviewed separately. Dispatch keeps 209 calls with the same
  two disposed and 207 active outcomes, disposal keeps 76 calls, and header
  duplicate detection keeps the same 12 rejects / 659 accepted first values.
  The common endpoint return replaces branches with 115 + 59 = 174 calls.
- No test, threshold, coverage exclusion, public declaration or package
  dependency is removed or weakened. Existing unit and integration assertions
  cover the changed private representation, including stale disposal and
  sequential replacement; no implementation-mirroring test is added.
- All 383 built integrations pass across 97 files (120.85 s), covering package
  archives, JavaScript, sessions, Master, CORS, browser tools, REST, GraphQL,
  server ownership and database work through the shared HTTP boundary.
- All nine backlog metadata checks pass after the final issue handoff.
- The final complete diff audit is green. No unresolved finding or work beyond
  the acceptance criteria remains; no new architectural decision is needed.
