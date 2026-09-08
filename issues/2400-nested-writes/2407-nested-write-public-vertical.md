# 2407: Prove the public nested-write vertical

- Status: planned
- Milestone: 24
- Packages: public example and cross-package tests
- Depends on: 2405, 2406
- ADR: ADR-0243

## Goal

Demonstrate one realistic recursive aggregate write through direct TypeScript,
REST, networkless GraphQL, and Yoga against PostgreSQL using only public APIs.

## Acceptance criteria

- [ ] The public minimal example documents a root create with a connected
      pointer, created relation targets, an existing connected target, final
      inclusion, and a later nested update/disconnect operation.
- [ ] Direct TypeScript, REST, networkless GraphQL, and Yoga persist and return
      equivalent logical graphs despite their transport-owned wire shapes.
- [ ] Anonymous, authenticated session, and audited Master calls retain exact
      application provenance and enforce independent root, child, relation,
      field, role, and ACL policy.
- [ ] Validation and Hooks observe the accepted deterministic node order and
      complete logical candidates exactly once; post-commit events publish only
      after the outer graph commits.
- [ ] A late child denial, invalid target, Hook failure, cancellation, limit
      failure, adapter failure, or projection failure leaves no root, child,
      edge, event, or private record behind.
- [ ] Multiple applications and PostgreSQL workers remain isolated, and one
      application's IDs or contexts cannot enter another application's graph.
- [ ] The example's generated declarations are replaceable and the same
      application executes without Typegen.

## Tests

- [ ] Real PostgreSQL Testcontainers, browser Fetch, source, built, packed,
      Typegen, Typegen-free JavaScript, authentication, Master, rollback,
      performance, and cross-transport parity fixtures pass.

## Out of scope

- Demonstrating deferred nested delete/upsert, bulk roots, SDK generation, or
  client-side optimistic updates.
