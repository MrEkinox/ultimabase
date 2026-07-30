# ADR-0009: HTTP servers are plugins

- Status: accepted
- Date: 2026-07-30

## Decision

HTTP serving is an application service contributed by plugins. Hono is the first Node.js implementation and listens on port `1337` by default.

## Consequences

REST and GraphQL do not own a server or depend directly on Hono. Future Express or Fastify plugins may satisfy the same contract.
