# ADR-0004: One operation engine

- Status: accepted
- Date: 2026-07-30

## Decision

Class APIs, REST, GraphQL, jobs, hooks, and tests normalize into common Query and Operation ASTs and execute through one Runtime pipeline.

## Consequences

Transports cannot contain SQL or bypass validation, access, hooks, transactions, audit, or events. Behavior remains consistent across protocols.
