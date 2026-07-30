# 315: Implement singular CRUD terminals

- Status: planned
- Milestone: 3
- Packages: `@ultimabase/runtime`, `@ultimabase/query`
- Depends on: 309, 312, 313
- ADR: ADR-0004

## Goal

Implement find, first, get, count, exists, createOne/create, updateOne, and deleteOne.

## Acceptance criteria

- [ ] Every terminal creates an Operation AST and uses Runtime.
- [ ] Result types reflect selection and singularity.
- [ ] Not-found semantics are consistent.

## Tests

- [ ] Fake-adapter contract tests for every terminal.
