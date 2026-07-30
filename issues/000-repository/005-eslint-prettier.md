# 005: Finalize lint and formatting

- Status: planned
- Milestone: 0
- Packages: repository
- Depends on: 001, 002
- ADR: ADR-0011

## Goal

Make strict typed ESLint and Prettier checks reproducible.

## Acceptance criteria

- [ ] ESLint uses project service type information.
- [ ] Generated files and build outputs are ignored.
- [ ] Tabs, no semicolons, and single quotes are consistent.
- [ ] Lint rules do not force arrow functions where public classes are intended.

## Tests

- [ ] `yarn lint` and `yarn format:check` pass.
