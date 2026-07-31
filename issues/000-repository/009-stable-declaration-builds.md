# 009: Keep declaration builds stable after typecheck

- Status: completed
- Milestone: 0
- Packages: tooling
- Depends on: 002, 003

## Goal

Prevent composite TypeScript outputs from changing or breaking the declarations
produced by a later package build.

## Acceptance criteria

- [x] Tsdown uses its established isolated-declaration generator explicitly.
- [x] A package build replaces preceding composite outputs with one bundled entry.
- [x] Dependent package type checks resolve the rebuilt declaration entry.
- [x] The root typecheck-then-build sequence passes.
