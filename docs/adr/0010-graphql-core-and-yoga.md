# ADR-0010: GraphQL Core and Yoga

- Status: accepted
- Date: 2026-07-30
- Refined by: ADR-0224

## Decision

GraphQL Core generates, merges, and executes `GraphQLSchema` instances without networking. Yoga is the first GraphQL-over-HTTP plugin and installs Core automatically when required.

Custom operations are supplied as completed schemas from any compatible builder.

## Consequences

UltimaBase does not compete with Nexus, Pothos, or GraphQL Tools. GraphiQL and Apollo Sandbox remain separate plugins.
