# 201: Define framework error model

- Status: planned
- Milestone: 2
- Packages: `@ultimabase/core`
- Depends on: 101
- ADR: ADR-0016

## Goal

Create typed framework errors with stable codes, causes, safe details, and transport-neutral metadata.

## Acceptance criteria

- [ ] Initial codes from the product specification exist.
- [ ] Sensitive internal details are separable from public details.
- [ ] Errors preserve causes.

## Tests

- [ ] Serialization and cause-chain tests.
