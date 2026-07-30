# 002: Make workspace typechecking executable

- Status: planned
- Milestone: 0
- Packages: all
- Depends on: 001
- ADR: ADR-0001, ADR-0011

## Goal

Validate project references and strict TypeScript configuration across all workspaces.

## Acceptance criteria

- [ ] `yarn typecheck` succeeds from a clean checkout.
- [ ] References follow the documented package graph.
- [ ] NodeNext import extensions and declaration output are correct.
- [ ] No package relies on implicit global types.

## Tests

- [ ] Introduce and revert a known cross-package violation to verify detection.
