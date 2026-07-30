# 007: Validate public package archives

- Status: planned
- Milestone: 0
- Packages: all publishable packages
- Depends on: 003
- ADR: ADR-0016

## Goal

Catch broken exports and declarations before publication.

## Acceptance criteria

- [ ] publint runs against every packed package.
- [ ] Are The Types Wrong checks NodeNext and bundler consumers.
- [ ] Package archives contain only intended files.
- [ ] Deep `src` imports fail from consumer fixtures.

## Tests

- [ ] CI runs package validation.
