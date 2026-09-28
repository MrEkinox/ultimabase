# 6204: Protect bounded owner-private storage

- Status: planned
- Milestone: 62
- Packages: `@ultimabase/core`, private-storage consumers
- Depends on: 6203
- ADR: proposed

## Goal

Keep owner-private records from growing into a second Query, schema, migration,
or transport system while preserving every current storage capability.

## Acceptance criteria

- [ ] Current private-storage consumers and operation requirements are audited.
- [ ] The active contract states which addressable record operations belong in private storage and which data belongs in schemas or domain capabilities.
- [ ] Existing owner, version, options, payload, transaction, synchronization, and lifecycle behavior remains available.
- [ ] No generic scans, filter language, bulk mutation API, or migration protocol is introduced.
- [ ] Documentation and enforcement tests reject accidental public-query expansion.
- [ ] Documentation impact is recorded.

## Tests

- [ ] Public export and private-storage capability regressions.
- [ ] Complete debt-refactor validation gate.

## Out of scope

- Renaming the feature without demonstrated DX value.
- Adding a private ORM.
- Reopening migration architecture.
