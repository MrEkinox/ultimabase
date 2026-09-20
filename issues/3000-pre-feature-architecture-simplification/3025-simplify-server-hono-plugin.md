# 3025: Simplify the Hono Server plugin

- Status: planned
- Milestone: 30
- Packages: `@ultimabase/server-hono-plugin`
- Depends on: 3024
- ADR: decision from issue 3002 and retained server-provider decisions

## Goal

Reduce the Hono adapter to a focused server provider for the active
application's Fetch graph.

## Acceptance criteria

- [ ] Baseline managed and user-supplied Hono applications, listener ownership,
      mount integration, start, stop, failure, restart, exports, and tests.
- [ ] Remove shared-application maps, reference counting, selection, and
      lifecycle branches made obsolete by the approved single-application
      contract.
- [ ] Preserve configured host and port behavior, ephemeral ports, native
      address failures, user-supplied application behavior, deterministic route
      installation, startup cleanup, stop, and disposal.
- [ ] Keep Hono and Node server details confined to this plugin.
- [ ] Change no public behavior, configuration, export, or error beyond issue
      3002's exact approved removals without an architecture stop and explicit
      user approval.
- [ ] Review the affected Hono Server pages under `apps/website/content/docs`
      and, when required, update them and the package README in the same audited
      issue.

## Tests

- [ ] Managed listener, supplied app, startup failure, restart, disposal,
      concurrent requests, HTTP integration, source and packed, JavaScript, and
      network E2E suites pass with unchanged coverage evidence.

## Audit gate

- [ ] Audit for listener leaks, duplicate mounts, stale shared-server state,
      changed ownership, hidden compatibility, and needless wrappers. Correct
      and repeat until green.
- [ ] Record package metrics, contract-matrix reconciliation, and Documentation
      impact before completion.

## Out of scope

- Adding another server framework or retaining unapproved shared hosting.
