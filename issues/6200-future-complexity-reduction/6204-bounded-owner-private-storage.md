# 6204: Protect bounded owner-private storage

- Status: completed
- Milestone: 62
- Packages: `@ultimabase/core`, private-storage consumers
- Depends on: 6203
- ADR: [ADR-0278](../../docs/adr/0278-bounded-owner-private-storage.md)

## Goal

Keep owner-private records from growing into a second Query, schema, migration,
or transport system while preserving every current storage capability.

## Acceptance criteria

- [x] Current private-storage consumers and operation requirements are audited.
- [x] The active contract states which addressable record operations belong in private storage and which data belongs in schemas or domain capabilities.
- [x] Existing owner, version, options, payload, transaction, synchronization, and lifecycle behavior remains available.
- [x] No generic scans, filter language, bulk mutation API, or migration protocol is introduced.
- [x] Documentation and enforcement tests reject accidental public-query expansion.
- [x] Documentation impact is recorded.

## Tests

- [x] Public export and private-storage capability regressions.
- [x] Complete debt-refactor validation gate.

## Out of scope

- Renaming the feature without demonstrated DX value.
- Adding a private ORM.
- Reopening migration architecture.

## Handoff

- Audited Password Auth as the sole product consumer: it needs exact insert,
  unique lookup, and compare-and-swap; Core/PostgreSQL retain exact update and
  delete as tested capabilities.
- Replaced the adapter's optional-field request interface with one exact
  discriminated union. PostgreSQL no longer reconstructs invariants with empty
  object fallbacks.
- ADR-0278 and the Core, PostgreSQL, and public plugin-authoring documentation
  define the schema/domain-capability decision boundary and reject private ORM,
  scan, filter, bulk, relation, transport, and migration expansion.
- Added runtime and compile-time enforcement for exact request shapes and the
  absence of Query-like handle methods.
- Preserved owner/instance isolation, package and protocol versions, normalized
  options, fields/indexes/references, fingerprint payload, transaction reuse,
  synchronization, orphan preservation, and adapter lifecycle behavior.
- Documentation impact: both. Core/PostgreSQL engineering contracts and the
  public plugin-authoring guide now document the closed boundary.
- `yarn validate:full` passed: 547 files / 2,595 ordinary tests; 622 files /
  2,842 coverage tests; statements 90.91% (23,710/26,078), branches 84.49%
  (14,684/17,379), functions 96.08% (5,002/5,206), lines 91.47%
  (22,998/25,140); issue metadata 1 file / 9 tests; website 17 files / 66
  tests. Lint completed with zero errors and existing line-budget warnings.
