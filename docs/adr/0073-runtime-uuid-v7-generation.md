# ADR-0073: Runtime-generated UUID v7 identifiers

- Status: accepted
- Date: 2026-08-01
- Refines: ADR-0014, ADR-0023, ADR-0072

## Decision

Runtime generates the framework-owned `id` before an object reaches a database
adapter. Generation is part of the structural validation stage: it only occurs
when the retained schema field has kind `uuid`, `generatedOn: "create"`, and
`uuidVersion: 7`. The generated value then passes through the same scalar
snapshot and constraint boundary as other create values.

UltimaBase delegates RFC 9562 layout and cryptographic randomness to the
maintained, zero-dependency `uuid` package instead of owning a custom UUID
implementation. Its version 7 generator receives the operation timestamp, so
every singular, bulk, and upsert-create ID carries the same clock instant used
for that operation's automatic timestamps.

`RuntimeValidationOptions.uuidV7Generator` accepts a typed
`(timestamp: number) => string` replacement. Runtime validates the replacement's
output through the system UUID field, while the application or test owns the
replacement's collision behavior.

## Consequences

UUID v7 values sort by distinct millisecond timestamps. UltimaBase does not
promise that identifiers created within the same millisecond are strictly
ordered, and callers must not use lexical ID order as a total creation order.

Default generation remains collision-resistant through cryptographic random
bits. Tests can inject stable fixtures without replacing the application clock
or weakening production generation.
