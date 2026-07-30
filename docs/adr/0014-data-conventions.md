# ADR-0014: Data naming and system fields

- Status: accepted
- Date: 2026-07-30

## Decision

Use UUID v7, reserved `id`/`createdAt`/`updatedAt`, server-side `Date`, ISO transport serialization, and plural `snake_case` PostgreSQL tables.

Required and nullable are independent. A field cannot be both required and nullable; optional fields remain non-null by default.

## Consequences

Create and update input inference differs from object output inference. Table names are predictable while allowing a future explicit override.
