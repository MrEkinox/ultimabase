# 607: Define experimental REST response and error contract

- Status: planned
- Milestone: 6
- Packages: `@ultimabase/rest`
- Depends on: 201, 606
- ADR: ADR-0004

## Goal

Map FrameworkError to safe HTTP statuses and structured bodies.

## Acceptance criteria

- [ ] Stable framework codes survive mapping.
- [ ] Internal details and stack traces are hidden.
- [ ] Request IDs are returned.
- [ ] Experimental-version marker is documented.

## Tests

- [ ] Error-code/status matrix.
