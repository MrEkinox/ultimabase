# 403: Implement direct role memberships

- Status: planned
- Milestone: 4
- Packages: `@ultimabase/roles`
- Depends on: 317, 402, 702
- ADR: ADR-0006, ADR-0113, ADR-0116

## Goal

Add stable plugin-resolved principal identities and roles as members through
transaction-safe relation services without requiring a Core user mode.

## Acceptance criteria

- [ ] Duplicate membership is idempotent or a typed conflict.
- [ ] Master is required by default.
- [ ] Membership changes emit audit-ready events.

## Tests

- [ ] Add, remove, duplicate, and rollback tests.
