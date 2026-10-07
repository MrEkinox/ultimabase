# ADR-0005: Immutable class-based public API

- Status: accepted
- Date: 2026-07-30
- Refined by: ADR-0093, ADR-0094, ADR-0109

## Decision

Use classes for public domain objects and builders, including `Query`, `ACL`, and `Role`. Builders are immutable. Stateless factories and callbacks remain arrow functions.

## Consequences

The API is discoverable and familiar without introducing hidden Active Record persistence. More instances are allocated, so implementations should use structural sharing where useful.
