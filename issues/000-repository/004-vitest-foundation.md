# 004: Configure Vitest projects

- Status: planned
- Milestone: 0
- Packages: all
- Depends on: 001
- ADR: ADR-0012

## Goal

Provide fast isolated unit, integration, and type-test projects.

## Acceptance criteria

- [ ] Unit and integration patterns are distinct.
- [ ] Tests run in parallel processes.
- [ ] Coverage uses V8 and excludes generated output.
- [ ] Watch mode works for package-local tests.

## Tests

- [ ] Add one smoke test in a foundational package.
- [ ] Verify failures return a non-zero status.
