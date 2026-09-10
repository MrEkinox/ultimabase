# 2613: Prove the public official soft-delete vertical

- Status: planned
- Milestone: 26
- Packages: all milestone 26 packages and public examples
- Depends on: 2612
- ADR: ADR-0245, once accepted

## Goal

Prove both modes through one real public application from source declarations
to PostgreSQL, direct execution, REST, GraphQL, and Master administration.

## Acceptance criteria

- [ ] A documented application enables replace mode on one schema, explicit
      mode on another, and leaves a third schema disabled through inheritance or
      direct override.
- [ ] The example demonstrates direct schema/model commands, REST and GraphQL
      explicit soft delete, retained hard delete, default invisibility, and
      server-side restore and purge.
- [ ] Official Access independently authorizes delete and `softDelete`; official
      Hooks and audit evidence distinguish delete, soft delete, restore, purge,
      physical update, and physical delete without duplicate lifecycle calls.
- [ ] Source TypeScript, generated Typegen, Typegen-free JavaScript, built and
      packed package consumers all use only public root exports.
- [ ] PostgreSQL synchronization, persistence plans, protected predicates,
      relations, counts, eager results, ordered delete batches, rollback, and
      application isolation match the portable contract.
- [ ] REST and GraphQL expose only eligible schemas and operations, report safe
      errors, and never expose restore or purge.
- [ ] The package README, root README, architecture, concepts, examples, and
      migration guidance explain the same developer contract and v1 exclusions.
- [ ] No example uses a raw adapter, deep import, manual tombstone mutation,
      generated Runtime client, or transport-specific business handler.

## Tests

- [ ] Focused public E2E suites cover anonymous, authenticated, Access-denied,
      Hook-failed, Master, restored, purged, cancelled, and cross-application
      requests through direct, REST, networkless GraphQL, and Yoga paths.
- [ ] Packed-package and Typegen-free fixtures run against PostgreSQL without
      repository-internal imports.

## Out of scope

- Expanding the v1 feature set beyond the accepted ADR and earlier issues.
