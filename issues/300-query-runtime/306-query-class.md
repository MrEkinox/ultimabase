# 306: Implement immutable Query class

- Status: planned
- Milestone: 3
- Packages: `@ultimabase/query`
- Depends on: 302, 303, 304, 305
- ADR: ADR-0005

## Goal

Expose a discoverable class API that produces Query AST without an engine.

## Acceptance criteria

- [ ] Every chain method returns a new instance.
- [ ] Branching from a base query is safe.
- [ ] Field/operator/value inference is preserved.
- [ ] Unbound queries expose no executable terminal behavior.

## Tests

- [ ] Immutability, structural sharing, and type tests.
