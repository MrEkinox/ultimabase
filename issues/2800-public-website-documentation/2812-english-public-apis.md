# 2812: Document TypeScript, REST, and GraphQL APIs

- Status: planned
- Milestone: 28
- Packages: `apps/website`, transport packages
- Depends on: 2805
- ADR: none

## Goal

Explain how the same application behavior is reached through direct TypeScript,
REST, network-independent GraphQL, and Yoga HTTP integration while preserving
each interface's wire conventions.

## Acceptance criteria

- [ ] Direct TypeScript pages connect schema-root and immutable model commands
      to the shared Runtime without exposing engine or authority internals.
- [ ] HTTP pages cover exact application selection, browser policy defaults,
      safe pre-dispatch failures, audited Master configuration, and Hono server
      ownership.
- [ ] REST pages cover route eligibility, `/api/v1`, query and mutation inputs,
      result envelopes, errors, authentication, and experimental status.
- [ ] GraphQL pages cover network-independent schema and execution, generated
      operations, Relay connection representation, Yoga mounting, and optional
      explorer plugins.
- [ ] Equivalent examples identify where TypeScript, REST, and GraphQL share
      semantics and where their result or pagination representation differs.
- [ ] No transport receives or is documented as receiving an application
      engine, raw adapter, lifecycle mutation surface, grant, or generic
      authority constructor.

## Tests

- [ ] Representative direct, REST, GraphQL, and Yoga examples execute against
      the same maintained application fixture.
- [ ] Wire examples and error envelopes are checked against current public
      transport behavior.

## Out of scope

- Generated SDKs, OpenAPI output, subscriptions, unshipped transports, hosting
  providers, or transport-specific business logic.
