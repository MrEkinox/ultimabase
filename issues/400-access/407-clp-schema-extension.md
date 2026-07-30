# 407: Implement clpPermissions schema extension

- Status: planned
- Milestone: 4
- Packages: `@ultimabase/clp-permissions`
- Depends on: 103, 401
- ADR: ADR-0002, ADR-0006

## Goal

Configure explicit rules per schema operation.

## Acceptance criteria

- [ ] Find, get, count, exists, create, update, and delete are separate.
- [ ] Rules may be direct or synchronous per-operation functions.
- [ ] Bulk operations reuse singular rules.

## Tests

- [ ] Type tests for context-aware rule functions.
