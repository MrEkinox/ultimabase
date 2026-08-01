# 608: Implement graphqlCorePlugin lifecycle

- Status: ready
- Milestone: 6
- Packages: `@ultimabase/graphql`
- Depends on: 204, 207, 208, 113
- ADR: ADR-0010

## Goal

Register generated schema contributions and expose a network-independent GraphQL service.

## Acceptance criteria

- [ ] No HTTP or Yoga dependency exists.
- [ ] Schema builds after all contributors register.
- [ ] Plugin exports the final schema and executor.

## Tests

- [ ] Application isolation and lifecycle tests.
