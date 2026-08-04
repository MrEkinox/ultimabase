# 506: Compile selection, ordering, offset, and cursors

- Status: done
- Milestone: 5
- Packages: `@ultimabase/postgres-plugin`, `@ultimabase/query`
- Depends on: 304, 305, 502, 503
- ADR: ADR-0004, ADR-0084

## Goal

Generate minimal select lists and stable pagination SQL.

## Acceptance criteria

- [x] Only columns retained by the normalized selection are loaded; future field-permission stages remove unreadable fields before this boundary.
- [x] Cursor ordering includes deterministic UUID tie-breaker.
- [x] Forward pagination uses a null-aware lexicographic predicate without duplicates or gaps under stable data.

## Tests

- [x] Clause fixtures cover first/resumed pages, equal-value branches, nullable ordering, projection, offset, and incompatible payloads.
