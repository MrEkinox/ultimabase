# 201: Define framework error model

- Status: done
- Milestone: 2
- Packages: `@ultimabase/core`
- Depends on: 101
- ADR: ADR-0042

## Goal

Create typed framework errors with stable codes, causes, safe details, and transport-neutral metadata.

## Acceptance criteria

- [x] Initial codes from the product specification exist.
- [x] Sensitive internal details are separable from public details.
- [x] Errors preserve causes.

## Tests

- [x] Serialization and cause-chain tests.
