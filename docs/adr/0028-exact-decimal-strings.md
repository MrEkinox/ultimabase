# ADR-0028: Exact decimal strings

- Status: accepted
- Date: 2026-07-31
- Extends: ADR-0024

## Decision

`decimalField()` represents exact base-10 values as strings. It uses the
distinct `decimal` field kind and never accepts JavaScript `number` values.
Plain notation requires an integer component, allows an optional non-empty
fraction, and rejects exponent notation, explicit plus signs, leading integer
zeroes, and negative zero representations. Fractional trailing zeroes remain
significant in the public representation.

`validation.precision` is an optional positive safe integer describing maximum
total precision. `validation.scale` is an optional non-negative safe integer
describing maximum fractional scale. When both are present, scale cannot exceed
precision. These are logical validation constraints that database adapters
must preserve when selecting physical column options.

Range boundaries use exact decimal strings. Schema compares them by parsing
their digits into native `bigint` coefficients and aligning their fractional
scales. It never converts values through binary floating point.

PostgreSQL adapters may map decimal fields to `numeric` or `decimal`.
Transports must keep their lossless string representation or use a dedicated
decimal scalar and codec.

## Consequences

Currency, measurements, and values beyond JavaScript safe-number precision can
be declared without adding a decimal arithmetic dependency to Schema. Static
defaults, runtime factories, database defaults, lists, inference, and
validation plans retain string values.

UltimaBase does not provide decimal arithmetic. Applications may choose their
preferred decimal library and convert its results to the exact string contract
at framework boundaries.
