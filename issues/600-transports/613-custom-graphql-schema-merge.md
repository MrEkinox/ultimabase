# 613: Merge custom GraphQLSchema instances

- Status: planned
- Milestone: 6
- Packages: `@ultimabase/graphql`
- Depends on: 608, 609
- ADR: ADR-0010

## Goal

Merge completed schemas from Nexus, Pothos, GraphQL Tools, or another builder.

## Acceptance criteria

- [ ] Multiple custom schemas are accepted.
- [ ] Non-overlapping fields may extend generated types.
- [ ] Conflicting fields fail startup rather than overwrite.
- [ ] Resolvers receive the complete UltimaBase GraphQL context.

## Tests

- [ ] Nexus-like, Pothos-like, extension, and conflict fixtures.
