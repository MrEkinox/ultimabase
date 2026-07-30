# 002: Make workspace typechecking executable

- Status: done
- Milestone: 0
- Packages: all
- Depends on: 001
- ADR: ADR-0001, ADR-0011

## Goal

Validate project references and strict TypeScript configuration across all workspaces.

## Acceptance criteria

- [x] `yarn typecheck` succeeds from a clean checkout.
- [x] References follow the documented package graph.
- [x] NodeNext import extensions and declaration output are correct.
- [x] No package relies on implicit global types.

## Tests

- [x] Introduce and revert a known cross-package violation to verify detection.

## Implementation notes

- Shared compiler options explicitly set `types` to an empty array. A package must opt into global type packages such as `node` or `vitest/globals`.
- Every publishable package is a composite project with declaration and declaration-map output.
- The root solution references packages in dependency order and keeps repository configuration files in a separate no-emit project.
- Verification temporarily imported `@ultimabase/core` from `@ultimabase/shared`; TypeScript rejected the undeclared project boundary, and the temporary violation was reverted.
