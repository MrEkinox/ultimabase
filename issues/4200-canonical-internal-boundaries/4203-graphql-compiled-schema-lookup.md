# 4203: Centralize GraphQL compiled-schema lookup

- Status: planned
- Milestone: 42
- Packages: `@ultimabase/graphql-plugin`
- Depends on: 4202
- ADR: ADR-0216

## Goal

Make GraphQL field, filter, connection, and mutation compilers share private
readers for required schema surfaces and compiled relationship targets.

## Acceptance criteria

- [ ] Repeated surface and target lookup guards use private package helpers.
- [ ] GraphQL names, ownership, target resolution, and exact failures remain unchanged.
- [ ] No public export or compiler protocol is added.
- [ ] Handwritten production lines decrease and focused parity tests pass.
- [ ] Documentation impact is recorded.

## Out of scope

- Changing the generated GraphQL schema or naming rules.
- Combining compiler classes or caches.
- Changing relationship or mutation semantics.
