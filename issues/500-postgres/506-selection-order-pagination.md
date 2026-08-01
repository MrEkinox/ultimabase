# 506: Compile selection, ordering, offset, and cursors

- Status: ready
- Milestone: 5
- Packages: `@ultimabase/postgres`
- Depends on: 304, 305, 502, 503
- ADR: ADR-0004

## Goal

Generate minimal select lists and stable pagination SQL.

## Acceptance criteria

- [ ] Only selected/readable columns are loaded.
- [ ] Cursor ordering includes deterministic UUID tie-breaker.
- [ ] Forward pagination has no duplicates or gaps under stable data.

## Tests

- [ ] Multi-page and equal-sort-value fixtures.
