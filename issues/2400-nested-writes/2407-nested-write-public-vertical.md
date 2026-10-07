# 2407: Prove the public nested-write vertical

- Status: completed
- Milestone: 24
- Packages: public example and cross-package tests
- Depends on: 2405, 2406
- ADR: ADR-0243

## Goal

Demonstrate one realistic recursive aggregate write through direct TypeScript,
REST, networkless GraphQL, and Yoga against PostgreSQL using only public APIs.

## Acceptance criteria

- [x] The public minimal example documents a root create with a connected
      pointer, created relation targets, an existing connected target, final
      inclusion, and a later nested update/disconnect operation.
- [x] Direct TypeScript, REST, networkless GraphQL, and Yoga persist and return
      equivalent logical graphs despite their transport-owned wire shapes.
- [x] Anonymous, authenticated session, and audited Master calls retain exact
      application provenance and enforce independent root, child, relation,
      field, role, and ACL policy.
- [x] Validation and Hooks observe the accepted deterministic node order and
      complete logical candidates exactly once; post-commit events publish only
      after the outer graph commits.
- [x] A late child denial, invalid target, Hook failure, cancellation, limit
      failure, adapter failure, or projection failure leaves no root, child,
      edge, event, or private record behind.
- [x] Multiple applications and PostgreSQL workers remain isolated, and one
      application's IDs or contexts cannot enter another application's graph.
- [x] The example's generated declarations are replaceable and the same
      application executes without Typegen.

## Tests

- [x] Real PostgreSQL Testcontainers, browser Fetch, source, built, packed,
      Typegen, Typegen-free JavaScript, authentication, Master, rollback,
      performance, and cross-transport parity fixtures pass.

## Out of scope

- Demonstrating deferred nested delete/upsert, bulk roots, SDK generation, or
  client-side optimistic updates.

## Completion evidence

- The minimal example now documents one aggregate create with a connected
  author, created and existing contributors, final inclusion, then a nested
  contributor update and disconnect.
- `nested-write-public-vertical.postgres.e2e.test.ts` executes that graph
  through direct TypeScript, REST, networkless GraphQL, and Yoga, compares the
  returned shapes, and verifies the four persisted PostgreSQL graphs.
- The vertical exposed and fixed a generic projection defect: protected output
  narrowing now retains its effective selected fields, so a parent Hooks
  boundary validates an included ACL-protected target without requiring fields
  that policy already removed.
- Existing focused nested-write and public authentication suites retain the
  complete policy, role, ACL, authority, lifecycle, limits, rollback,
  cancellation, application-isolation, and worker-isolation matrix.
- Core boundary tests, minimal Typegen checks, Typegen-free JavaScript fixtures,
  performance budgets, 145 packed-package tests, 2,151 repository tests, and
  300 complete E2E tests pass. Lint reports only the centralized historical
  file-size warnings.
