# 306: Implement immutable Query class

- Status: done
- Milestone: 3
- Packages: `@ultimabase/query`
- Depends on: 302, 303, 304, 305
- ADR: ADR-0005, ADR-0058

## Goal

Expose a discoverable class API that produces Query AST without an engine.

## Acceptance criteria

- [x] Every chain method returns a new instance.
- [x] Branching from a base query is safe.
- [x] Field/operator/value inference is preserved.
- [x] Unbound queries expose no executable terminal behavior.

## Tests

- [x] Immutability, structural sharing, and type tests.
