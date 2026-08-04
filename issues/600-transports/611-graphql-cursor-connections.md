# 611: Generate GraphQL cursor connections

- Status: planned
- Milestone: 6
- Packages: `@ultimabase/graphql-plugin`
- Depends on: 305, 506, 609
- ADR: ADR-0010

## Goal

Use cursor connections from the first GraphQL release.

## Acceptance criteria

- [ ] Connections expose edges, nodes, and pageInfo.
- [ ] Forward cursor pagination is stable.
- [ ] Cursors remain opaque.

## Tests

- [ ] Multi-page execution fixtures.
