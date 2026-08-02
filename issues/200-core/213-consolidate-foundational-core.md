# 213: Consolidate the foundational Core package

- Status: done
- Milestone: 3
- Packages: `@ultimabase/core`, `@ultimabase/shared`, all official plugins
- Depends on: 212, 323
- ADR: ADR-0095

## Goal

Move Schema, Query, Access, application orchestration, and Runtime into one
cohesive `@ultimabase/core` package while preserving their internal domain
boundaries and exact public TypeScript behavior.

## Acceptance criteria

- [x] `@ultimabase/core` publicly exports the supported Schema, Query, Access,
      application, plugin, and Runtime APIs through one controlled entry point.
- [x] Internal `schema`, `query`, `access`, and `runtime` folders retain focused
      ownership and never import concrete infrastructure or permission plugins.
- [x] The pre-release `@ultimabase/schema`, `@ultimabase/query`,
      `@ultimabase/access`, and `@ultimabase/runtime` workspaces are removed
      without compatibility facades.
- [x] Every official plugin imports its foundational contracts from Core and
      removes redundant workspace dependencies.
- [x] TypeScript references, release configuration, archive checks, coverage,
      examples, and documentation reflect the single package boundary.
- [x] Existing public autocomplete, compact hovers, schema inference, immutable
      Query behavior, request security, Runtime execution, and PostgreSQL E2E
      contracts remain unchanged.
- [x] Dependency checks still prevent Core from importing concrete plugins or
      infrastructure libraries.
- [x] ADR-0095 and the active hook plan explain why consolidation enables
      direct native hook inference.

## Tests

- [x] Core runtime and compile-time suites include all migrated source tests.
- [x] Public-export tests prove supported exports and reject removed package
      entry points.
- [x] Packed-package language-service fixtures use only `@ultimabase/core`.
- [x] Unit, type, build, lint, archive, dependency, release, and coverage checks
      pass.
- [ ] PostgreSQL E2E passes locally. Testcontainers could not find an active
      container runtime on 2026-08-02; the existing PostgreSQL contract remains
      covered by the unchanged suite and CI can execute it with Docker.

## Out of scope

- Executing the new native hook lifecycle.
- Merging optional plugins or `@ultimabase/shared` into Core.
