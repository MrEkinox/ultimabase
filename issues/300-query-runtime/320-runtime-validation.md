# 320: Execute normalization and validation

- Status: planned
- Milestone: 3
- Packages: `@ultimabase/runtime`, `@ultimabase/schema`
- Depends on: 115, 307, 312
- ADR: ADR-0004, ADR-0038, ADR-0039

## Goal

Apply schema validation plans before access checks and hooks.

## Acceptance criteria

- [ ] Create, update, bulk, and upsert inputs use the correct plan.
- [ ] Defaults are applied without mutating caller input.
- [ ] Scalar constraints and defaults are read from each plan's declared field.
- [ ] Runtime default factories execute once per created object.
- [ ] Database defaults remain owned by the database adapter.
- [ ] Master does not bypass validation by default.
- [ ] Validation errors contain field paths.

## Tests

- [ ] Runtime and bulk validation matrices.
