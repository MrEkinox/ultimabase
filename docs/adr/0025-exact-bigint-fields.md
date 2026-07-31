# ADR-0025: Exact bigint fields

- Status: accepted
- Date: 2026-07-31

## Decision

Schema exposes `bigintField()` with the distinct `bigint` field kind and native
TypeScript `bigint` values. Defaults and range boundaries therefore use bigint
literals, and `autoIncrement` remains available as declarative sequence
metadata.

`intField()` continues to represent safe JavaScript `number` integers. A
PostgreSQL adapter may choose a wider physical column for those values, but
that storage choice does not change their public value contract.

Bigint range normalization reuses the generic ordered-range boundary shared by
integer and float fields. Runtime validation plans retain bigint boundaries
without coercing them to numbers or strings.

Transports own bigint serialization. JSON adapters require an explicit string
codec, and GraphQL adapters require a custom scalar rather than silently
converting values through the standard number type.

## Consequences

Applications can use the complete exact PostgreSQL bigint domain supported by
their runtime without risking JavaScript number precision loss. Bigint
defaults, lists, inference, validation plans, and indexes remain distinguishable
from safe integers.

Transport plugins must explicitly claim bigint support during application
setup. Schema stays independent from one JSON encoding or GraphQL scalar
implementation.
