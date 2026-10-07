# ADR-0038: Static and runtime field defaults

- Status: accepted
- Date: 2026-07-31
- Validation-plan representation refined by: ADR-0039
- Temporal magic defaults superseded by: ADR-0040
- Supersedes: ADR-0018 and the database-default portions of ADR-0020,
  ADR-0023, ADR-0026, and ADR-0028

## Decision

A field `default` accepts only one static field value or a zero-argument
runtime factory that returns one field value. Every function remains a runtime
factory; function-valued static defaults are unsupported.

Schema preserves static values and runtime factories in distinct validation
plan descriptors without executing callbacks. Declarative temporal values such
as `today` and `now` continue to compile into runtime-clock descriptors.

Database-specific expressions do not belong to the portable `default` option.
An adapter that needs expressions such as PostgreSQL functions contributes its
own typed field extension and compiler instead of adding infrastructure
metadata to Schema.

## Consequences

`DatabaseDefault`, `getDefaultKind`, `DefaultKind`, and database validation
default plans are removed from the public API. Field inference has one smaller
default union, and validation plans have no adapter-owned default branch.

Database plugins remain free to expose typed expression helpers through their
own extensions while Core Schema stays database-neutral.
