# ADR-0026: Explicit temporal field representations

- Status: accepted
- Date: 2026-07-31
- Refines: ADR-0014

## Decision

Schema exposes three temporal value contracts:

- `dateField()` represents a calendar day as `YYYY-MM-DD`;
- `timeField()` represents a complete time of day, with timezone support
  disabled by default;
- `dateTimeField()` represents a complete date and time, with timezone support
  enabled by default.

All three values remain strings so they preserve their declared calendar,
wall-clock, or instant semantics without inheriting JavaScript `Date`
limitations. Zone-less time values use `HH:mm:ss.sss`, while zoned values append
`Z` or an ISO offset. Date-time values use the equivalent ISO date and time
forms.

The `timezone` option is available only to time-bearing fields. It defaults to
`false` for `timeField()` and `true` for `dateTimeField()`.

`default: "today"` on a date field and `default: "now"` on time-bearing fields
are declarative runtime-clock defaults. Runtime captures one instant per
operation and shares it across temporal defaults and system fields.
Application timezone configuration, defaulting to UTC, controls calendar and
zone-less projections. Database-owned clock expressions remain available
through the separate `DatabaseDefault` contract.

All temporal fields support static, runtime, and database defaults,
homogeneous lists, indexes, presence rules, and ordered ranges. Range
comparison respects represented instants for timezone-bearing values.

The framework-owned `createdAt` and `updatedAt` values use zoned `dateTime`
fields. Runtime owns their generation and refresh behavior.

PostgreSQL adapters may map the contracts respectively to `date`, `time`,
`timetz`, `timestamp`, and `timestamptz` while preserving their public string
representations. Schema does not expose those storage choices.

## Consequences

Developers select calendar dates, times of day, and date-times through distinct
factory names. The API avoids using `timestamp` for a value that JavaScript
developers could reasonably interpret as epoch milliseconds.

Inference, validation plans, GraphQL scalars, and generated clients can
distinguish all three temporal kinds and their timezone policy. Runtime plans
also distinguish clock defaults from developer factories and static strings.

This intentionally replaces the ADR-0014 server-side `Date` value decision
without changing its unrelated naming, presence, or indexing decisions.
