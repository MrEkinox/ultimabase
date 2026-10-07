# 315: Implement singular CRUD terminals

- Status: completed
- Milestone: 3
- Packages: `@ultimabase/runtime`, `@ultimabase/query`
- Depends on: 309, 312, 313
- ADR: ADR-0004, ADR-0067

## Goal

Implement find, first, get, count, exists, createOne/create, updateOne, and deleteOne.

## Acceptance criteria

- [x] Every terminal creates an Operation AST and uses Runtime.
- [x] Result types reflect selection and singularity.
- [x] Not-found semantics are consistent.

## Tests

- [x] Fake-adapter contract tests for every terminal.
