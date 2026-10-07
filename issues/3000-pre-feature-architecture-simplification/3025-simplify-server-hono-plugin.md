# 3025: Simplify the Hono Server plugin

- Status: completed
- Milestone: 30
- Packages: `@ultimabase/server-hono-plugin`
- Depends on: 3024
- ADR: decision from issue 3002 and retained server-provider decisions

## Goal

Reduce the Hono adapter to a focused server provider for the active
application's Fetch graph.

## Acceptance criteria

- [x] Baseline managed and user-supplied Hono applications, listener ownership,
      mount integration, start, stop, failure, restart, exports, and tests.
- [x] Remove shared-application maps, reference counting, selection, and
      lifecycle branches made obsolete by the approved single-application
      contract.
- [x] Preserve configured host and port behavior, ephemeral ports, native
      address failures, user-supplied application behavior, deterministic route
      installation, startup cleanup, stop, and disposal.
- [x] Keep Hono and Node server details confined to this plugin.
- [x] Change no public behavior, configuration, export, or error beyond issue
      3002's exact approved removals without an architecture stop and explicit
      user approval.
- [x] Review the affected Hono Server pages under `apps/website/content/docs`
      and, when required, update them and the package README in the same audited
      issue.

## Tests

- [x] Managed listener, supplied app, startup failure, restart, disposal,
      concurrent requests, HTTP integration, source and packed, JavaScript, and
      network E2E suites pass with unchanged coverage evidence.

## Audit gate

- [x] Audit for listener leaks, duplicate mounts, stale shared-server state,
      changed ownership, hidden compatibility, and needless wrappers. Correct
      and repeat until green.
- [x] Record package metrics, contract-matrix reconciliation, and Documentation
      impact before completion.

## Out of scope

- Adding another server framework or retaining unapproved shared hosting.

## Implementation and preservation audit

The five-module baseline covers normalized managed/external options, typed Hono
integration, raw Node header evidence, deterministic mounting, serialized
start/stop, browser-policy ownership, listener opening/draining, startup failure
cleanup and sequential reuse. Issue 3007 already removed shared application maps
and reference counting; none is reintroduced.

The plugin's public stop and dispose hooks now use the same private stop callback.
Two one-use capability-read relays and the private provider's dispose-to-stop
alias are removed. The exact capability reads and actual queued stop are retained.
Private provider tests call the canonical stop directly; all assertions and
public application stop/dispose coverage remain intact.

The lifecycle queue always stores `result.catch(() => undefined)`, so its next
operation does not need a second rejection continuation. Callers still receive
their own original result or failure. After the exact-owner admission check, a
managed start cannot retain an existing listener: failed cleanup retains its
owner and successful cleanup clears the listener before releasing ownership.
The redundant second server-absence condition is therefore removed.

The admission flag, exact owner, once-only dispatcher, listener identity and
queue remain necessary. New requests stop before draining; failed cleanup
retains ownership; stale-owner shutdown cannot affect a replacement. External
listeners and ordinary Hono routes remain developer-owned. Repeated lifecycle
calls, retry after EADDRINUSE, ephemeral ports, concurrent requests, original
header evidence and CORS ownership keep their behavior. The test-only parallel
provider fixture uses independent fake HTTP values, not concurrent initialized
UltimaBase applications; it adds no product capability.

Production changes from five files / 495 lines to five / 492 (-3). The six
exports and 3,566 declaration bytes are byte-identical. No public option,
method, error, network claim, dependency or listener guarantee changes.
B-004–B-008/B-010–B-012 and P-009–P-011/P-017/P-020/P-022/P-023 are reconciled.

Documentation impact: internal engineering documentation.
The package README and Hono Server website page were reviewed. They already
correctly explain sole ownership, sequential reuse, managed/external listeners,
ports, failure, raw headers, CORS and cleanup. No public edit is needed.

Validation evidence:

- All 34 package unit/type checks pass across eight files (7.07 s), including
  real listener tests, failed cleanup/retry, public editor contracts and both
  Chromium browser scenarios. Root typecheck, package build, ESLint and
  dependency constraints pass.
- All 277 package/source-integration checks pass across 82 files (133.12 s).
  All five coverage maps remain and comparison with the complete 3022 report
  finds no lost retained covered location. The 20 edited records were reviewed:
  the shared lifecycle callback retains 17 + 17 = 34 hook calls, the provider
  keeps its 101 queued lifecycle operations and 58 stops, and managed/external
  starts keep their 16 / 21 outcomes. No test assertion, coverage exclusion or
  threshold is removed or weakened.
- All 147 affected built integrations pass across 26 files (41.43 s), covering
  managed Yoga listeners, public REST/GraphQL parity, sessions, generated APIs,
  packed exports, and JavaScript. The final complete diff audit is green with
  no unresolved finding or work beyond the acceptance criteria.
- All nine backlog metadata checks pass after the final issue handoff.
