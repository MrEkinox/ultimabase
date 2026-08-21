# 335: Verify native hooks against PostgreSQL

- Status: completed
- Milestone: 3
- Packages: `@ultimabase/core`, `@ultimabase/postgres-plugin`, `@ultimabase/testing`
- Depends on: 508, 518, 331, 332, 333, 334, 337, 338
- ADR: ADR-0087, ADR-0089, ADR-0090

## Goal

Prove the complete public native hook contract, plugin contributions, and
automatic rollback behavior against a live PostgreSQL database.

## Acceptance criteria

- [x] One schema declares schema and inline field hooks through public exports.
- [x] One plugin targets an exact schema, an exact field path, and a field kind without replacing developer hooks.
- [x] One fixture policy plugin contributes a deny-only guard and registers a compiler for its opaque adapter constraint without Runtime knowing the policy name.
- [x] Create, update, delete, save, find, output, and post-commit families execute in documented order.
- [x] A before-hook writes a related row and a later failure rolls back both the hook write and primary mutation.
- [x] A successful mutation commits once and releases buffered post-commit work afterward.
- [x] `beforeFind` transforms a query while monotonic adapter constraints and field restrictions remain intact and the final result remains restricted after every result transform.
- [x] Set-based bulk operations do not load rows merely to emulate item hooks.
- [x] Tests use public built package exports and worker-isolated Testcontainers schemas.
- [x] Package documentation shows the verified developer-facing API.

## Tests

- [x] Root PostgreSQL E2E covers success, rollback, plugin order, read transforms, generic policy enforcement, output resolution, and bulk behavior.
- [x] The scenario runs through `yarn test:e2e` and the GitHub CI Docker runner.

## Out of scope

- Concrete CLP, ACL, role, or field-permission behavior.
- REST and GraphQL transport-specific assertions.
