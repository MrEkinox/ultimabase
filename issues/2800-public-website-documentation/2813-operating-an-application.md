# 2813: Document operating an application

- Status: completed
- Milestone: 28
- Packages: `apps/website`, runtime and infrastructure packages
- Depends on: 2807, 2810, 2811, 2812
- ADR: none

## Goal

Explain how to configure, start, stop, and operate the currently shipped
UltimaBase stack beyond the first local tutorial without inventing a hosted
platform or unimplemented operational capabilities.

## Acceptance criteria

- [x] Operations navigation covers environment and typed configuration,
      application lifecycle, PostgreSQL connectivity, server startup and
      graceful shutdown, secrets, browser policy, and a provider-neutral
      production checklist.
- [x] Node.js, TypeScript, PostgreSQL, package, and relevant protocol
      compatibility requirements are stated from maintained repository or
      package sources.
- [x] PostgreSQL guidance distinguishes direct schema synchronization from the
      separately planned migration capability and never documents migrations as
      shipped.
- [x] Lifecycle guidance explains startup failure, partial materialization,
      cleanup, signal ownership, resource disposal, and application isolation
      only through supported public behavior.
- [x] Secret guidance keeps database credentials, password-session material,
      and Master keys server-side and links to the exact HTTP and security
      boundaries.
- [x] Browser-origin guidance states that policy is disabled by default,
      preflight is infrastructure-only, and applications sharing a server need
      one structurally identical effective policy.
- [x] The production checklist identifies currently missing health,
      observability, migration, cache, job, and administration capabilities as
      limitations rather than suggesting undocumented workarounds.

## Tests

- [x] Configuration and startup snippets compile or execute against current
      public package exports.
- [x] Maintained compatibility values and documented defaults are checked
      against their canonical repository sources where practical.
- [x] Security terminology and links agree with the public security and HTTP
      documentation.

## Out of scope

- Selecting a cloud or container provider, deployment templates, Kubernetes,
  an operations dashboard, unshipped migrations, health endpoints,
  observability, backup policy, or service-level guarantees.
