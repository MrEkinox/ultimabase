# ADR-0053: Field-kind filter capabilities

- Status: accepted
- Date: 2026-07-31
- Refines: ADR-0004, ADR-0052
- Refined by: ADR-0135, ADR-0136

## Decision

Primitive filter nodes form a schema-correlated union. Their field name selects
both the available operator kinds and the exact inferred operand type. Optional
property absence is never an operand. Nullable scalar fields accept `null` for
equality and membership, while ordered comparisons require a non-null value.

Equality and membership apply to non-list bigint, binary, boolean, date,
date-time, decimal, enum, float, integer, JSON, string, time, and UUID fields.
Ordered comparisons apply to bigint, date, date-time, decimal, float, integer,
string, and time fields. String matching and regex apply only to non-list
`string` fields. Exact string ordering and collation remain adapter policy.

Existence applies to every schema field. Objects, list fields, and plugin-owned
field kinds otherwise receive no built-in value operators because their correct
semantics depend on structure or plugin behavior. Their owning plugins may
contribute additional operator contracts without weakening the built-in type
matrix.

Regex nodes carry a source string and semantic flags for case-insensitive,
multiline, and dot-matches-newline behavior. They never retain a JavaScript
`RegExp`, callback, or other executable value. Database adapters translate the
flags and parameterize the source rather than interpolating it into SQL.

## Consequences

Invalid operator, field, and value combinations fail in TypeScript before a
query reaches Runtime. Exact enum unions, native bigint values, decimals,
temporal strings, nullable values, system fields, and inference extensions flow
through the same operand contract.

The explicit capability lists require a deliberate Query decision whenever a
new built-in field kind is introduced. This prevents a new storage type from
silently inheriting comparisons that an adapter cannot implement consistently.
