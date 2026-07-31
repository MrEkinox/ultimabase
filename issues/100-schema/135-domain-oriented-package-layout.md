# 135: Organize Schema internals by domain

- Status: completed
- Milestone: 1
- Packages: schema
- Depends on: 134
- ADR: 0035

## Goal

Replace the flat Schema source and test layouts with a domain-oriented internal
structure without changing the package's public API or behavior.

## Acceptance criteria

- [x] Sources are grouped under fields, schema, plans, inference, extensions, and internal domains.
- [x] Tests mirror the same major domains while remaining owned by the package.
- [x] Focused helpers are merged when separate files add no useful boundary.
- [x] The root entry remains the only supported public module.
- [x] No internal barrel files or new package aliases are introduced.
- [x] Package documentation describes the internal dependency direction.
- [x] Typecheck, tests, lint, build, package validation, and coverage pass.

## Tests

- [x] Existing runtime and compile-time tests pass from their new locations.
- [x] Public export and archive tests prove that no deep import became public.

## Out of scope

- Public API changes and splitting Schema into additional packages.
