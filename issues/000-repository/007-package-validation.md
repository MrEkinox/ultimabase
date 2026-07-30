# 007: Validate public package archives

- Status: done
- Milestone: 0
- Packages: all publishable packages
- Depends on: 003
- ADR: ADR-0016

## Goal

Catch broken exports and declarations before publication.

## Acceptance criteria

- [x] publint runs against every packed package.
- [x] Are The Types Wrong checks NodeNext and bundler consumers.
- [x] Package archives contain only intended files.
- [x] Deep `src` imports fail from consumer fixtures.

## Tests

- [x] CI runs package validation.

## Implementation notes

- tsdown packs each workspace with Yarn and runs publint plus Are The Types Wrong against that exact archive. The ESM-only ATTW profile checks NodeNext ESM and bundler resolution while excluding unsupported CommonJS consumption.
- Build output includes the repository Apache-2.0 license under `dist`, avoiding duplicated tracked license files across packages.
- A Vitest consumer fixture uses `@publint/pack` to inspect Yarn's exact file list, accepts only `README.md`, `package.json`, and `dist`, imports each package root, and requires deep source imports to fail with `ERR_PACKAGE_PATH_NOT_EXPORTED`.
- The E2E project runs package validation locally and in CI. `yarn test:pack` remains available as a focused command.
